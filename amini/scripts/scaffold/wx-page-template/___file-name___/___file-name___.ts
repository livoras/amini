import { SuperPage, IBasePageData } from "@core/classes/SuperPage"
import { wxPage } from "@angular/core"

/** onload 参数, 所有都是string */
interface ILoadParams {
  groupId?: string
}

/** 页面数据 */
interface IData extends IBasePageData {
  groupId: string
}

type LoadParams = Record<keyof ILoadParams, string> | undefined

/**
 * ___title___
 *
 * @class ___ClassName___
 * @extends {SuperSetData<IPageDate>}
 * @implements {PageOpts}
 */
@wxPage()
class ___ClassName___ extends SuperPage<IData> implements Page.PageInstance<IData> {
  public data = {
  } as IData

  constructor() {
    super()
  }

  /** DELETE: 注意，onLoad onShow onReady onHide onUnload 都要在第一行调用 super.onXX */

  public onLoad(options: LoadParams): void {
    super.onLoad(options)
  }

  public onShow(): void {
    super.onShow()
  }

}
