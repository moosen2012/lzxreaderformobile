# 10 - Workflow 编排：用"依赖 + 字段映射"代替"画边"

> 本教程按 **3W 原则**组织：先讲清楚 **是什么**（What），再讲 **为什么用**（Why），最后落到 **怎么写**（How）。读完你应该能独立用 Workflow 表达"多源数据组装"型的复杂业务流。

---

## 1. What — Workflow 是什么

`Workflow` 是 Eino 在 `Graph` 之上提供的**高阶编排容器**。它底层还是 Graph，但用一种**更接近"数据流 + 业务建模"**的 API 暴露给用户。

源码定位：[`compose/workflow.go`](file:///c:/Users/11577/Documents/gitee/eino01to99/eino/compose/workflow.go)

```go
// Workflow is wrapper of graph, replacing AddEdge with declaring dependencies
// and field mappings between nodes. Under the hood it uses NodeTriggerMode(AllPredecessor),
// so does not support cycles.
type Workflow[I, O any] struct {
    g                *graph
    workflowNodes    map[string]*WorkflowNode
    workflowBranches []*WorkflowBranch
    dependencies     map[string]map[string]dependencyType
}
```

关键点：
- **没有 `AddEdge`**——所有连线通过 `node.AddInput(fromNode, mappings...)` 声明。
- 节点之间的数据流靠 **`FieldMapping` 字段映射**描述，而不是类型匹配。
- 强制 **`AllPredecessor`** 模式（必须所有前驱完成才能跑），**不支持环**。
- 支持 `AddDependency(fromNode)` —— 只控制"先后"不传数据。
- 支持 `SetStaticValue(path, value)` —— 注入"硬编码的字段"。

> 一句话：**Workflow = 字段映射驱动的 DAG**。

---

## 2. Why — 为什么用 Workflow

### 2.1 Graph 在"多源字段组装"场景下的痛点

假设你要做一个"商品详情页"：需要从 4 个来源拼装最终响应。

```text
[user_ctx] ----+
[basic_info] --+--> [assembler] --> END
[inventory]  --+
[reviews]    --+
```

用 Graph 写：

```go
// 节点输出是 map[string]any
_ = g.AddLambdaNode("user_ctx", userCtxLambda)
_ = g.AddLambdaNode("basic_info", basicInfoLambda)
_ = g.AddLambdaNode("inventory", invLambda)
_ = g.AddLambdaNode("reviews", reviewLambda)

// 问题：assembler 的入参是什么？
// 1) 是 map[string]any（key 是节点名）？OK，但下游要按固定 key 取数据
// 2) 是 struct{User, Basic, Inventory, Reviews}？需要写 FieldMapping
_ = g.AddLambdaNode("assembler", assemblerLambda)  // 假设入参是 struct{...}
_ = g.AddEdge("user_ctx",   "assembler", compose.WithFieldMapping(...))
_ = g.AddEdge("basic_info", "assembler", compose.WithFieldMapping(...))
_ = g.AddEdge("inventory",  "assembler", compose.WithFieldMapping(...))
_ = g.AddEdge("reviews",    "assembler", compose.WithFieldMapping(...))
```

字段映射散落在 4 个 `AddEdge` 上，谁映射到 `User` 字段、谁映射到 `Reviews` 字段，要"扫一遍所有边"才能搞清楚。

### 2.2 Workflow 把映射"集中在接收方"

Workflow 的 API 是**接收方视角**：

```go
assembler := wf.AddLambdaNode("assembler", assemblerLambda)
assembler.AddInput("user_ctx",   compose.MapFields("user_ctx", "User"))
assembler.AddInput("basic_info", compose.MapFields("basic_info", "Product"))
assembler.AddInput("inventory",  compose.MapFields("inventory", "Stock"))
assembler.AddInput("reviews",    compose.MapFields("reviews", "Reviews"))
```

看一眼 `assembler` 节点，就知道它"依赖了谁、要了谁的数据"。

### 2.3 Workflow 的三个独有能力

| 能力 | 用途 |
| --- | --- |
| `AddInput` + 字段映射 | 集中在接收方声明"我要谁的数据，填到哪个字段" |
| `AddDependency` | 只声明"先后顺序"，不传数据（适合"先初始化再业务"）|
| `SetStaticValue` | 编译期注入"硬编码字段"（适合配置/常量）|

---

## 3. How — 怎么用 Workflow

### 3.1 入门：四源数据装配

```go
type assemblerInput struct {
    User    *UserCtx
    Product *BasicInfo
    Stock   *Inventory
    Reviews *[]Review
}

assembler := func(ctx context.Context, in assemblerInput) (*ProductDetail, error) {
    return &ProductDetail{
        User:    in.User,
        Info:    in.Product,
        Stock:   in.Stock,
        Reviews: in.Reviews,
    }, nil
}

wf := compose.NewWorkflow[struct{ ID string }, *ProductDetail]()
assemblerNode := wf.AddLambdaNode("assembler", compose.InvokableLambda(assembler))

userCtx := wf.AddLambdaNode("user_ctx",   userCtxLambda)
product  := wf.AddLambdaNode("basic_info", productLambda)
stock    := wf.AddLambdaNode("inventory",  stockLambda)
reviews  := wf.AddLambdaNode("reviews",    reviewLambda)

// 接收方视角：assembler 声明要谁的数据
assemblerNode.AddInput("user_ctx",
    compose.MapFields("user_ctx", "User"))
assemblerNode.AddInput("basic_info",
    compose.MapFields("basic_info", "Product"))
assemblerNode.AddInput("inventory",
    compose.MapFields("inventory", "Stock"))
assemblerNode.AddInput("reviews",
    compose.MapFields("reviews", "Reviews"))

// 入口：从 START 到 4 个源
wf.End().AddInput("user_ctx")
wf.End().AddInput("basic_info")
wf.End().AddInput("inventory")
wf.End().AddInput("reviews")
// 注：这里 wf.End() 代表"虚拟 END 节点之前的汇聚点"
```

> 提示：实际生产中，START 节点可以用 `wf.AddLambdaNode("_start_", startLambda)`，然后让 4 个源 `AddInput("_start_")`。

### 3.2 嵌套字段映射

`MapFields` 支持路径语法：

```go
// 把上游的 user.profile.name 映射到本节点的 userName
assemblerNode.AddInput("user_ctx",
    compose.MapFields("user_ctx.profile.name", "UserName"))

// 数组访问
assemblerNode.AddInput("reviews",
    compose.MapFields("reviews[0]", "FirstReview"))
```

### 3.3 AddDependency：只控顺序不传数据

适合"前置准备"型节点：

```go
dbInit := wf.AddLambdaNode("db_init", dbInitLambda)
business := wf.AddLambdaNode("business", businessLambda)

business.AddDependency("db_init")    // 业务逻辑要等 DB 初始化完成
```

> 业务节点不会拿到 db_init 的输出，只保证"db_init 先跑完"。

### 3.4 SetStaticValue：编译期注入常量

```go
policy := wf.AddLambdaNode("policy", policyLambda)
policy.SetStaticValue(compose.FieldPath{"Config", "Region"}, "cn-shanghai")
policy.SetStaticValue(compose.FieldPath{"Config", "Tier"},  "premium")
```

> 常量在编译时被注入 Lambda 的 `in` 参数。`policyLambda` 接收 `struct{ Config struct{Region, Tier string} }`，Region/Tier 已经是固定值。

### 3.5 WorkflowBranch：路由 + 字段映射

```go
branch := wf.AddBranch("intent", compose.NewGraphBranch(
    func(ctx context.Context, in *Intent) (string, error) {
        if in.NeedSearch {
            return "search", nil
        }
        return "direct", nil
    },
    map[string]bool{"search": true, "direct": true},
))

searchNode := wf.AddLambdaNode("search", searchLambda)
searchNode.AddInput("intent", compose.MapFields("intent", "Query"))

directNode := wf.AddLambdaNode("direct", directLambda)
directNode.AddInput("intent", compose.MapFields("intent", "Query"))
```

> **关键区别**：Workflow 的 Branch **不会自动把输入传给下游**。每个 end node 必须自己声明 `AddInput`。

### 3.6 编译与运行

```go
runnable, err := wf.Compile(ctx)
if err != nil { panic(err) }

out, _ := runnable.Invoke(ctx, struct{ ID string }{ID: "sku-001"})
```

---

## 4. Workflow vs Graph：什么时候用哪个？

| 维度 | Graph | Workflow |
| --- | --- | --- |
| 表达拓扑 | 任意 DAG / 环 | 仅 DAG（无环）|
| API 风格 | 边（AddEdge）| 节点（AddInput / AddDependency）|
| 字段映射 | 边级别 | 节点级别（接收方）|
| 静态值 | 不支持 | 支持（`SetStaticValue`）|
| 数据流视角 | "上游往哪去" | "我要什么" |
| 学习曲线 | 中 | 略高（要先理解 FieldPath）|
| 典型场景 | 灵活控制流 | 多源数据组装 / 业务建模 |

> **经验法则**：
> - 节点之间**有清晰数据契约**（结构体字段）→ 优先 Workflow。
> - 节点之间只关心**类型流**（输入是 X，输出是 Y）→ 优先 Graph。
> - 简单的"线性流水线"→ 用 Chain 就够了。

---

## 5. 实践清单（生产环境）

- [ ] **节点用业务名命名**（`assembler` / `validator`），方便排查。
- [ ] **同一上游被多个下游消费**时，每个下游各自 `AddInput` 一次，不要共享。
- [ ] **FieldMapping 路径要先验证**：写测试或在 `Compile` 报错时检查路径。
- [ ] **`SetStaticValue` 只放配置/常量**，运行时计算请用 Lambda。
- [ ] **复杂工作流拆子图**：`AddGraphNode` 嵌套使用。
- [ ] **加全局 Callback 观测**：每个节点的输入输出都会被回调记录（详见《回调》教程）。

---

## 6. 一句话总结

> **Workflow = 字段映射驱动的 DAG。**当你有"多个数据源拼成一个对象"这类业务，Workflow 比 Graph 更顺手；只要类型流、没复杂字段映射，Graph/Chain 更轻。
