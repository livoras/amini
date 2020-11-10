import { Observer, Observable, of } from "rxjs"

/** 转换指定的微信api 为 rxjs */

const noConvertApiList = ["getUpdateManager", "nextTick"]

/** 映射 wx api 到 rxwx */

type wxType = typeof wx
type wxKeys = keyof Omit<wxType, "cloud">
type wxApiOptions<T extends wxKeys> = Parameters<wxType[T]>[0]

type wxApiSuccessParams<T extends wxKeys> = wxApiOptions<T> extends {
  success?: (params: infer S) => void,
  fail?: (params: infer F) => void,
  complete?: (params: infer C) => void,
} ? S : never
export type Rxwx = {[x in wxKeys]?: (params: wxApiOptions<x>) => Observable<wxApiSuccessParams<x>>} & IRxwxCustomApi

interface IRxwxCustomApi {
  /** 已经转换 */
  hasInit: boolean
  /** 禁止转换的 wx api */
  // noConvert(...keys: Array<keyof wx.Wx>): void
  /** 转换api */
  init(): void
}

export const rxwx: Rxwx = {
  hasInit: false,
  // noConvert(...keys: Array<keyof wx.Wx>): void {
  //   keys.forEach((key) => {
  //     rxwx[key] = wx[key]
  //     noConvertApiList.push(key)
  //   })
  // },
  init(): void {
    if (this.hasInit) {
      console.error("rxwx 已经初始化")
      return
    }
    this.hasInit = true
    // 转换 wx api 到 Observable
    Reflect.ownKeys(wx).forEach((key: any): void => {
      switch (typeof wx[key]) {
      case "object":
        rxwx[key] = Object.assign(wx[key])
        break
      case "function":
        const noCovert = /.*Sync$/.test(key) ||
          /^(create|on).+/.test(key) ||
          noConvertApiList.indexOf(key) > -1
        if (noCovert)  {
          // rxwx[key] = wx[key]
        } else {
          rxwx[key] = cbFunc2Obs(wx[key])
        }
        break
      default:
        rxwx[key] = wx[key]
      }
    })
  },
}

// showToast 的 success 不是 toast 隐藏后触发，而是调用成功后就触发，需要另外修改
// rxwx.noConvert("showToast")
rxwx.showToast = function showToast(opt: wx.ShowToastOption): Observable<wx.GeneralCallbackResult> {
  return Observable.create((observer: Observer<wx.GeneralCallbackResult>) => {
    wx.showToast(opt)
    setTimeout(() => {
      observer.next({ errMsg: "" })
      observer.complete()
    }, opt.duration || 1500)
  })
}

type obsFunc = (opt: any) => Observable<any>

/** callback func 转换为流 */
const cbFunc2Obs  = (fn: any): obsFunc => {
  return (opt: any): Observable<any> =>
  Observable.create((observer: Observer<any>) => {
    opt.success = (res: any): void => {
      observer.next(res)
      observer.complete()
    }
    opt.fail = (err: any): void => {
      observer.error(err)
      observer.complete()
    }
    fn.call(null, opt)
  })
}
