# Contributing

欢迎提交问题、文档改进和代码变更。较大的协议或调度语义调整，建议先通过 Issue 说明触发场景与预期行为。

## 本地验证

```bash
go test ./...
go vet ./...
node --test scripts/release.test.mjs
npm --prefix web ci
npm --prefix web run build
node scripts/release.mjs check
```

修改队列、租约、上报或并发逻辑时，设置 `FLOWFORGE_TEST_DATABASE_URL` 运行真实 PostgreSQL 集成测试；相关说明见 [测试文档](docs/testing.md)。

Go 源码使用 `gofmt`；前端使用 `npm --prefix web run format`。调度行为变更应添加能反映业务语义的测试，并同步 OpenAPI、示例和文档。不要在核心包中添加具体企业的业务判断。

## Pull Request

- 描述具体问题及变更后的行为。
- 给出适当验证结果；涉及 UI 时可附不含凭据的截图。
- 说明对已有流程定义、运行实例和 API 的兼容性。
- 不提交本地配置、密钥、依赖目录、数据备份或构建产物。

发布范围和文件大小规则见 [发布说明](docs/releasing.md)。贡献按项目的 MIT 许可证提交。
