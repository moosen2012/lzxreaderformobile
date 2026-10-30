package expo.modules.saftree

import android.net.Uri
import android.provider.DocumentsContract
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * SAF 目录树列举（只返回元数据，不读文件内容）。
 *
 * 存在的唯一原因：
 * expo-file-system 的 `StorageAccessFramework.readDirectoryAsync()` 内部走
 * `DocumentFile.fromTreeUri(uri)`，而它取的是 URI 里 `tree/` 后面那一段文档 id
 * ——也就是用户最初授权的根目录。所以拿子目录 URI 去调用，返回的永远是根目录内容
 * （上游 expo/expo#20102，维护者确认"设计如此"），无法递归。
 *
 * 这里始终保留授权的原始 treeUri，用 documentId 拼子目录 URI：
 *   content://<authority>/tree/<rootDocId>/document/<childDocId>
 * 权限天然落在授权子树内，且一次 query 就能拿齐名称 / 类型 / 大小 / 修改时间。
 *
 * 配套 JS 侧：src/services/saf/。
 */
class SafTreeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SafTree")

    AsyncFunction("listChildren") { treeUriString: String, documentId: String? ->
      val treeUri = Uri.parse(treeUriString)
      val resolver = appContext.reactContext?.contentResolver
        ?: throw SafTreeContextException()

      val parentDocumentId = documentId ?: treeDocumentId(treeUri, treeUriString)
      val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId)

      val cursor = try {
        resolver.query(childrenUri, PROJECTION, null, null, null)
      } catch (error: Exception) {
        throw SafTreeQueryException(treeUriString, error.message)
      } ?: throw SafTreeQueryException(treeUriString, null)

      val entries = ArrayList<Map<String, Any?>>(cursor.count.coerceAtLeast(0))
      cursor.use { c ->
        val idIndex = c.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
        val nameIndex = c.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
        val mimeIndex = c.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
        val sizeIndex = c.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
        val mtimeIndex = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

        while (c.moveToNext()) {
          val childId = if (idIndex >= 0) c.getString(idIndex) else null
          if (childId.isNullOrEmpty()) continue

          val mime = if (mimeIndex >= 0) c.getString(mimeIndex) ?: "" else ""
          val name = when {
            nameIndex >= 0 && !c.isNull(nameIndex) -> c.getString(nameIndex)
            else -> childId.substringAfterLast('/')
          } ?: continue

          val entry = HashMap<String, Any?>(6)
          entry["documentId"] = childId
          entry["name"] = name
          entry["isDirectory"] = mime == DocumentsContract.Document.MIME_TYPE_DIR
          entry["mimeType"] = mime
          // 子文档 URI：读取内容时直接交给 FileSystem.readAsStringAsync
          entry["uri"] = DocumentsContract.buildDocumentUriUsingTree(treeUri, childId).toString()
          if (sizeIndex >= 0 && !c.isNull(sizeIndex)) {
            entry["size"] = c.getLong(sizeIndex).toDouble()
          }
          if (mtimeIndex >= 0 && !c.isNull(mtimeIndex)) {
            entry["mtime"] = c.getLong(mtimeIndex).toDouble()
          }
          entries.add(entry)
        }
      }

      entries
    }

    /**
     * 直接按 uri 读文本内容（UTF-8）。
     *
     * 为什么不用 FileSystem.readAsStringAsync：
     * expo 的 `isSAFUri` 硬编码 `host.startsWith("com.android.externalstorage")`，
     * 其余 content:// （Google Drive / OneDrive / 部分 OEM 文件管理器）会走
     * `else -> throw IOException`，于是"树能扫出来、文件一个都打不开"。
     * 这里用 ContentResolver 直读，权限已经由 treeUri 的持久化授权覆盖。
     */
    AsyncFunction("readAsString") { uriString: String ->
      val uri = Uri.parse(uriString)
      val resolver = appContext.reactContext?.contentResolver
        ?: throw SafTreeContextException()

      try {
        resolver.openInputStream(uri)?.use { stream ->
          stream.bufferedReader(Charsets.UTF_8).readText()
        } ?: throw SafTreeReadException(uriString, "document provider returned no stream")
      } catch (error: SafTreeReadException) {
        throw error
      } catch (error: Exception) {
        throw SafTreeReadException(uriString, error.message)
      }
    }

    /**
     * 按 base64 读二进制内容（docx / xlsx / pdf）。
     *
     * 不能复用 readAsString：这些格式是 zip / 二进制流，按 UTF-8 解码会直接损坏字节。
     * 也不用 expo 的 readAsStringAsync(Base64) —— 同样只支持 externalstorage 这一种 authority，
     * 云盘（Drive / OneDrive）目录导入出来的文件在那些 provider 上会 IOException。
     */
    AsyncFunction("readAsBase64") { uriString: String ->
      val uri = Uri.parse(uriString)
      val resolver = appContext.reactContext?.contentResolver
        ?: throw SafTreeContextException()

      try {
        resolver.openInputStream(uri)?.use { stream ->
          android.util.Base64.encodeToString(stream.readBytes(), android.util.Base64.NO_WRAP)
        } ?: throw SafTreeReadException(uriString, "document provider returned no stream")
      } catch (error: SafTreeReadException) {
        throw error
      } catch (error: Exception) {
        throw SafTreeReadException(uriString, error.message)
      }
    }
  }

  private fun treeDocumentId(treeUri: Uri, raw: String): String {
    // getTreeDocumentId 对非 tree URI 会抛 IllegalArgumentException；
    // 这里统一转成带 code 的异常，JS 侧能拿到可读信息
    if (treeUri.pathSegments.firstOrNull() != "tree") {
      throw SafTreeUriException(raw)
    }
    return try {
      DocumentsContract.getTreeDocumentId(treeUri)
    } catch (error: Exception) {
      throw SafTreeUriException(raw)
    }
  }

  private companion object {
    val PROJECTION = arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_SIZE,
      DocumentsContract.Document.COLUMN_LAST_MODIFIED
    )
  }
}

internal class SafTreeContextException :
  CodedException("React context is not available. Is the app running?")

internal class SafTreeUriException(uri: String) :
  CodedException("Uri '$uri' is not a Storage Access Framework tree uri")

internal class SafTreeQueryException(uri: String, reason: String?) :
  CodedException(
    if (reason.isNullOrEmpty()) {
      "Cannot list children of '$uri'. The permission may have been revoked."
    } else {
      "Cannot list children of '$uri': $reason"
    }
  )

internal class SafTreeReadException(uri: String, reason: String?) :
  CodedException(
    if (reason.isNullOrEmpty()) {
      "Cannot read '$uri'. The permission may have been revoked."
    } else {
      "Cannot read '$uri': $reason"
    }
  )
