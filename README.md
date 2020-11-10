# Amini
Amini 是一个 Angular 风格的微信小程序开发库

**NOTE**：该项目正在积极的开发当中，代码和文档将逐渐完善，暂时请勿使用。

## Features
1. 强制使用 TypeScript 进行开发
2. 兼容 Angular 的依赖注入方式
3. 使用 rx.js
4. Mixin 方式进行页面逻辑复用
5. RouterService 进行页面跳转
6. @Lock、@DataBind、@Debounce、@Throttle 等系列装饰器提高效率
7. 局部 setData 方案
8. 提供 computed 计算属性
9. 可选的:
   1. Form 表单管理
   2. DataList 分页管理
   3. VirtualList 无限列表
   4. Draggable 拖拽控制

Example：

```typescript
import { wxPage } from "@angular/core"
import { SuperPage } from "@core/classes/SuperPage"
import { MQTTService } from "@mono-shared/services/mqtt/mqtt.service"
import { DefaultService } from "@mono-shared/services/swagger.service"
import { FileService } from "@core/services/file.service"
import { config } from "@config"

/** onload 参数, 所有都是string */
interface ILoadParams {
  groupId?: number
  /** 图片host， 基类已赋值，可直接用 */
  resHost?: string
}

/** 页面数据 */
interface IData {
  groupId: number
  imageSrc: string
  videoSrc: string
  imagesSrc: string[]
}
type PageData = Partial<IData>
type LoadParams = Record<keyof ILoadParams, string> | undefined

/**
 * 实例页面
 *
 * @class Home
 * @extends {SuperSetData<IPageDate>}
 * @implements {PageOpts}
 */
@wxPage()
class Home extends SuperPage<PageData> implements Page.PageInstance<PageData> {
  public data: PageData = {
    imageSrc: "",
    imagesSrc: [],
  }

  constructor(
    private mqtt: MQTTService,
    private fileService: FileService,
    private swaggerService: DefaultService,
  ) {
    super()
  }

  public onLoad(options: LoadParams): void {
    super.onLoad(options)
    /** 1. 创建一个实时通信的接口 */
    const socket = this.mqtt.createSocket("/apply/brand")

    /** 2. 监听数据推送 */
    socket.subscribe((data: any) => {
      console.log("==> 获取到数据", data)
    })

    /** 3. 要在页面销毁的时候销毁接口 */
    this.unloadObservable.subscribe(() => socket.leave())

  }

  public onUnload(): void {
    super.onUnload()
  }

  /** 单图 */
  public handleUpload(): void {
    this.fileService.uploadAnImage().subscribe((data) => {
      this.setData({ imageSrc: config.resHost + "/" + data.path })
    })
  }

  /** 多图 */
  public handleUploads(): void {
    this.fileService.uploadImages().subscribe((data) => {
      this.setData({ imagesSrc: data.map((img) => config.resHost + "/" + img.path ) })
    })
  }

  public handleUploadVideo(): void {
    this.fileService.uploadVideo().subscribe((data) => {
      this.setData({ videoSrc: config.resHost + "/" + data.path })
    })
  }
}
```
