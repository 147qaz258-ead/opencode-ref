## 使用说明

这些模板的依赖项通过 [pnpm](https://pnpm.io) 管理，执行命令`pnpm up -Lri`即可更新依赖。
这也是项目中会出现`pnpm-lock.yaml`文件的原因。当然，你也可以使用其他任意包管理工具，克隆模板后可直接删除该文件，不会影响使用。

```bash
$ npm install # 也可执行 pnpm install 或 yarn install
```

如需了解更多内容，可访问 [Solid 官方网站](https://solidjs.com)，也欢迎加入我们的 [Discord 社区](https://discord.com/invite/solidjs) 交流。

## 可用脚本命令

在项目目录下，可执行以下命令：

### `npm run dev` 或 `npm start`

以开发模式启动项目应用。<br>
在浏览器中打开 [http://localhost:3000](http://localhost:3000) 即可访问。
修改代码后，页面会自动重新加载。<br>

### `npm run build`

为生产环境构建项目，构建产物会输出至`dist`文件夹。<br>
该命令会以生产模式正确打包 Solid 框架，并对构建产物做性能优化处理。
最终的构建文件会进行代码压缩，且文件名会附带哈希值。<br>
构建完成后，你的应用即可部署上线！

## 部署方式

可将生成的`dist`文件夹部署至任意静态托管平台（如 Netlify、Surge、Vercel 等）。
