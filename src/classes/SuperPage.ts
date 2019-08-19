import { SuperSetData } from "./SuperSetData"
import { Observable, Subject } from "rxjs"

export class SuperPage<T> extends SuperSetData<T> implements Page.PageInstance {
  protected unloadObservable: Observable<void>
  private unloadSubject: Subject<void> = new Subject<void>()
  private loadOption: any
  constructor() {
    super()
    this.unloadObservable = this.unloadSubject.asObservable()
  }

  public onLoad(opt?: any): void {
  }

  public onReady(): void { }

  public onShow(): void {
  }

  public onHide(): void { }

  public onUnload(): void {
    this.unloadSubject.next()
  }

  public onAllDataLoaded(): void {
  }

  public handleFormIdCollectDone(e: WXEvent): void {
  }

  public handleRetryLoadData(): void {
    const opt = this.loadOption || {}
    const query = Object.keys(opt).reduce<string>((ret, key) => {
      return `${ret}${!ret ? "?" : "&"}${key}=${opt[key]}`
    }, "")
    wx.redirectTo({
      url: "/" + (this as any).__route__ + query,
    })
  }
}
