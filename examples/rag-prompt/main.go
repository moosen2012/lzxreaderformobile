package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/cloudwego/eino/components/prompt"
	"github.com/cloudwego/eino/schema"
)

func main() {
	ctx := context.Background()

	// 知识点：RAG（Retrieval-Augmented Generation）的 prompt 模板核心是
	// "把检索到的上下文动态拼到 system prompt 里"。用 FString 的 {context} 占位
	// 是最朴素也最常用的做法——把 []*Document 拼成 string 后塞进去。
	// 进阶方案：把 Document 列表直接以 MessageInputPart 形式塞进 UserInputMultiContent。
	// RAG：动态拼装上下文
	ragTpl := prompt.FromMessages(schema.FString,
		// 知识点：context 占位符的位置在 system message 里——告诉模型"这是参考资料"。
		// 注意：不要把检索结果塞到 user message 里，否则模型会误以为是用户输入。
		schema.SystemMessage(`你是知识库助手。基于以下上下文回答问题。

上下文：
{context}
`),
		// 知识点：history 用 optional=true，RAG 场景下"是否带历史"取决于产品形态。
		//   - 单轮问答：可以不带 history
		//   - 多轮对话：必须带 history，否则上下文指代会断
		schema.MessagesPlaceholder("history", true),
		schema.UserMessage("{question}"),
	)

	// 模拟检索到的文档
	// 知识点：实际生产中，docs 来自 Retriever.Retrieve(ctx, query) 的返回值。
	// 这里手写只是 demo——核心流程是"vector store 查 topK -> []*Document"。
	retrievedDocs := []*schema.Document{
		{Content: "RAG（Retrieval-Augmented Generation）是一种结合检索和生成的技术。"},
		{Content: "RAG 通过从知识库中检索相关文档，增强 LLM 的回答能力。"},
		{Content: "RAG 的典型流程：检索 → 重排序 → 生成。"},
	}

	// 模拟对话历史
	chatHistory := []*schema.Message{
		schema.UserMessage("什么是 RAG？"),
		schema.AssistantMessage("RAG 是检索增强生成技术。", nil),
	}

	// 用户问题
	userQuery := "RAG 的典型流程是什么？"

	// 渲染模板
	// 知识点：context 占位符的值是 string 类型，由业务把 []*Document 拼成一段文本。
	// 拼装原则：
	//   - 标注来源（[1] / [2]...）方便模型引用
	//   - 控制总长度（避免超出模型 context window）
	//   - 必要时分段（用换行 + 编号）
	msgs, err := ragTpl.Format(ctx, map[string]any{
		"context":  buildContext(retrievedDocs),
		"history":  chatHistory,
		"question": userQuery,
	})
	if err != nil {
		fmt.Printf("模板渲染失败: %v\n", err)
		return
	}

	fmt.Printf("总共 %d 条消息:\n", len(msgs))
	for _, m := range msgs {
		fmt.Printf("[%s] %s\n", m.Role, m.Content)
	}
}

// 把 []*Document 拼成 string
// 知识点：buildContext 是一个"工程化工具函数"，把 RAG 检索结果格式化成模型友好的文本。
// 实战要点：
//   1. 标注来源编号（[1] [2]）——模型在回答里能引用"根据 [1]"
//   2. 用换行分隔——多文档连成一段时不易读
//   3. 控制总长度——超长 context 容易触发"中间遗忘"和"长上下文税"
func buildContext(docs []*schema.Document) string {
	var sb strings.Builder
	for i, doc := range docs {
		sb.WriteString(fmt.Sprintf("[%d] %s\n", i+1, doc.Content))
	}
	return sb.String()

	// 知识点：进阶版本可以附加 doc.MetaData 里的字段，如：
	//   fmt.Sprintf("[%d] (来源: %s, 章节: %s) %s\n", i+1, doc.MetaData["source"], doc.MetaData["section"], doc.Content)
	// 这样模型能给出更精准的引用。
}
