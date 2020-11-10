import { Observable, forkJoin, Subject, Subscriber, Observer, throwError, of } from "rxjs"
import { config } from "@config"
import { UtilService } from "./util.service"
import { Injectable } from "../amini/core"
import { rxwx } from "@core/amini/rxwx"
import { map, catchError, tap, switchMap } from "rxjs/operators"
import { HttpClient, skipErrorOptions } from "@core/services/http-client.service"
import { wxlog } from "@core/decorators/qjl-wxlog"
import { PerformanceMonitorId } from "./monitor-id.interfaces"
import { PerformanceMonitorService } from "./performance-monitor.service"
import { MonoCommonService } from "@mono-shared/services/mono-common.service"
import { IAliYunOssImageInfo } from "@mono-shared/models/interfaces"

// 默认头像
// tslint:disable-next-line:max-line-length
export const defaultAvatar = "https://img0.shangshi360.com/ss/app/image/plus/header-img.png?x-oss-process=image/resize,m_fill,limit_0,w_360,h_360"

export interface IMedia {
  path: string
}

export type PRIVACY_SCOPE = "private" | "public"

export const enum UploadError {
  // 单图
  SINGLE = "请上传小于或等于7M的图片",
  // 多图
  MULTIFILE = "上传图片中有大于7M的图片，请上传小于或等于7M的图片",
  // 视频大小
  VIDEO_MAX = "请上传小于或等于10M的视频",
  // 取消视频兼容测试
  VIDEO_CANCEL_TIPS = "chooseVideo fail",
}

export interface IVIdeoUploadOtherOptions {
  limitSelectedTime?: number,
  limitMaxSize?: number,
}

export const enum AliOssVideoStatus {
  ENABLE,
  /** 除违规视频外错误 */
  COMMON_ERROR,
  /** 违规视频错误 */
  ILLEGAL_ERROR,
}

/** 文件上传相关帮助方法 */
@Injectable()
export class FileService {

  private defaultVideoOtherOptions = {
    limitMaxSize: 50,
  }
  constructor(
    private httpClient: HttpClient,
    private util: UtilService,
    private aliMonitor: PerformanceMonitorService,
    private common: MonoCommonService,
  ) {}

  public transformImageUrl(imageUrl: string): string {
    const deletePreSprit = imageUrl.replace(/^[\/]{1,}/, "")
    const hasHttp = imageUrl.includes("://")
    return hasHttp ? deletePreSprit : (config.resHost + "/" + deletePreSprit)
  }

  /** Mb 转换为 bytes */
  public getSizeMB(n: number): number {
    return n * 1024 * 1024
  }

  /**
   * 小程序 文件上传方法
   *
   * @param url 上传api
   * @param filePath 文件临时路径
   * @param formData 请求携带的其他信息
   * @return {Observable}
   */
  public upload(
    filePath: string,
    formData: any = {},
    scope: PRIVACY_SCOPE = "public",
  ): Observable<any> {
    return this.uploadFileOSS(filePath, scope)
  }

  /**
   * 选择多张图片并上传
   *
   * @param imagesOption 上传图片相关配置
   * @param formData 携带的其他信息
   * @param scope
   * @param sessionKey
   */
  public uploadImages(
    imagesOption: wx.ChooseImageOption = {},
    formData: any = {},
    scope: PRIVACY_SCOPE = "public",
    sessionKey: string = "",
  ): Observable<IMedia[]> {
    // 函数第一次跳过success执行选择图片，之后回到success中执行图片上传，执行上面的upload方法
    const startTime = new Date().getTime()
    return new Observable((observer: Observer<any>): void => {
      const chooseImageCallback: wx.ChooseImageOption = {
        success: (res: wx.ChooseImageSuccessCallbackResult): void => {
          wx.showLoading({
            title: "上传中",
            mask: true,
          })
          if (this.validatePictureSize(res)) {
            const errorTips = res.tempFilePaths && res.tempFiles.length > 1 ? UploadError.MULTIFILE : UploadError.SINGLE
            wx.hideLoading({})
            wx.showModal({
              title: "错误",
              content: errorTips,
              showCancel: false,
            })
            observer.error({ errMsg: errorTips })
            observer.complete()
            return
          }
          const uploadImageObserver$ = res.tempFilePaths.map(
            (filePath: string) => this.upload(filePath, formData, scope),
          )
          forkJoin(...uploadImageObserver$).subscribe((uploadRes: Array<{ path: string }>) => {
            this.aLiYunUploadSuccess(uploadRes, startTime, sessionKey)
            observer.next(uploadRes)
          }, (err: any) => {
            observer.error(err)
            this.aLiYunUploadImgFail(err)
          }, () => {
            wx.hideLoading({})
            observer.complete()
          })
        },
        fail: (err: wx.GeneralCallbackResult): void => {
          this.wxUploadImgFail(err)
          observer.error({ errMsg: "选择图片失败" })
          observer.complete()
        },
      }
      wx.chooseImage({ ...imagesOption, ...chooseImageCallback })
    })
  }

  /**
   * 选择单张图片上传
   *
   * @param imagesOption 上传图片相关配置
   * @param formData 携带的其他信息
   */
  public uploadAnImage(
    imagesOption: wx.ChooseImageOption = {},
    formData: any = {},
    scope: PRIVACY_SCOPE = "public",
    sessionKey: string = "",
  ): Observable<IMedia> {
    return this.uploadImages({ ...imagesOption, count: 1 }, formData, scope, sessionKey)
      .pipe(map((images) => images[0]))
  }

  /** 上传视频 */
  public uploadVideo(videoOptions: wx.ChooseVideoOption & IVIdeoUploadOtherOptions = {} ): Observable<IMedia> {
    const length = videoOptions.maxDuration || 60 // 最长60秒
    const duration = Array.from({ length }).map((n: any, i: number) => i + 1)
    const sourceType = [["camera"], ["album"], ["album", "camera"]]
    const camera = ["front", "back"]
    const processVideoFail = (
      res: wx.ChooseVideoSuccessCallbackResult,
      observer: Observer<any>,
    ): void  => this.processVideoFail(res, observer)
    const processVideoSuc = (
      e: any,
      observer: Observer<any>,
      videoOtherOptions: IVIdeoUploadOtherOptions,
    ): void => this.processVideoSuc(e, observer, videoOtherOptions)
    return Observable.create((observer: Observer<any>) => {
      wx.chooseVideo({
        sourceType: sourceType[2] as ["album", "camera"], // 拍摄或相册
        camera: camera[2] as "back", // 前置或后置
        maxDuration: duration[duration.length - 1],
        success: (res: wx.ChooseVideoSuccessCallbackResult): void => {
          processVideoSuc(res, observer, videoOptions)
        },
        fail(e: any): void {
          processVideoFail(e, observer)
        },
      })
    })
  }

  /**
   * 下载文件，适合用于下载服务器返回流文件
   *
   * @param {string} url 下载地址，不用加服务器域名
   * @param {*} header 下载请求头
   * @param {string} filePath 指定文件下载后存储的路径
   * @memberof FileService
   */
  public downloadFileFromServer(url: string, header: IAnyObject = {}, filePath?: string): Observable<string> {
    const app = this.util.getApp()
    const defaultHeader = {
      "Content-Type": "X-WWW-FORM-URLENCODED",
      "Cookie": `ls=${app.getStorage("ls")}`,
    }
    const downloadUrl = this.addHost(url)
    return rxwx.downloadFile({
      url: downloadUrl,
      header: Object.assign(defaultHeader, header),
      filePath,
    }).pipe(map((result: any) => {
      if (result.statusCode === 200) {
        return result.tempFilePath
      } else {
        console.error(`${url}下载失败`)
        return ""
      }
    }))
  }

  public uploadFileOSS(imgSrc: string, scope: PRIVACY_SCOPE): Observable<any> {
    return this.getUploadFileFormData(imgSrc, scope).pipe(
      switchMap((formData: any) => {
        const uploadFileURL = formData.host
        return rxwx.uploadFile({
          url: uploadFileURL,
          filePath: imgSrc,
          name: "file",
          formData,
        }).pipe(map((ret: any) => {
          return { path: formData.key, result: ret }
        }))
      }),
    )
  }

  public getRealImgUrl(
    host: string,
    url: string,
    isSquare: boolean = true,
    isZoom: boolean = false,
    width?: number,
    height?: number,
  ): string  {
    return this.common.getRealImgUrl(host, url, isSquare, isZoom, width, height)
  }

  /**
   * 批量获取阿里云图片信息
   *
   * @param {string[]} urlList
   * @returns {Observable<IAliYunOssImageInfo[]>}
   * @memberof FileService
   */
  public getImageInfoInBatch(urlList: string[]): Observable<IAliYunOssImageInfo[]> {
    /** 获取图片信息 */
    const requestList = urlList.map((urlItem) => this.httpClient.get<IAliYunOssImageInfo>(
      config.resHost + "/" + urlItem + `?x-oss-process=image/info`,
      {},
      skipErrorOptions,
    ))
    return forkJoin(...requestList)
  }

  /**
   * 获取视频可访问状态（请求视频1px截帧图片，查看http statusCode）
   *
   * @param {string} url 视频url
   * @returns {Observable<AliOssVideoStatus>}
   * @memberof FileService
   */
  public getVideoStatus(url: string): Observable<AliOssVideoStatus> {
    const videoOnePixelSnapshotParam = "?x-oss-process=video/snapshot,t_0,f_png,w_1,h_1,ar_auto"
    return this.httpClient.get<AliOssVideoStatus>(
      config.resHost + "/" + url + videoOnePixelSnapshotParam,
      {},
      skipErrorOptions,
    ).pipe(
      map(() => AliOssVideoStatus.ENABLE),
      catchError(({ statusCode }) => {
        const ALI_OSS_ILLEGAL_VIDEO_STATUS_CODE = 403
        if (statusCode === ALI_OSS_ILLEGAL_VIDEO_STATUS_CODE) {
          return of(AliOssVideoStatus.ILLEGAL_ERROR)
        }
        return of(AliOssVideoStatus.COMMON_ERROR)
      }),
    )
  }

  /**
   * 限制图片大小校验函数
   *
   * @param {wx.ChooseImageSuccessCallbackResult} res wx组件返回参数
   * @returns {boolean}
   * @memberof FileService
   */
  private validatePictureSize(res: wx.ChooseImageSuccessCallbackResult): boolean {
    return res.tempFiles.some((picture) => picture.size > this.getSizeMB(7))
  }

  /**
   * 阿里云上传成功回调函数
   *
   * @param {Array<{ path: string }>} uploadRes
   * @param {number} startTime
   * @memberof FileService
   */
  private aLiYunUploadSuccess(uploadRes: Array<{ path: string }>, startTime: number, sessionKey: string): void {
    wx.showToast({
      title: "上传成功",
      icon: "success",
      duration: 2000,
    })
    uploadRes = uploadRes || []
    // 加上 '/'
    uploadRes.forEach((item) => {
      if (item.path[0] !== "/") { item.path = "/" + item.path}
    })
    const paths = uploadRes.map((i) => i.path)
    /** 微信图片安全校验 */
    if (paths.length > 0) {
      this.httpClient.post("/sys/wx_safety_audit/image", { body: { imageUrl: paths, sessionKey } }).subscribe()
    }
    const endTime = new Date().getTime()
    if (endTime - startTime >= 5000) {
      this.aliMonitor.sum(PerformanceMonitorId.UPLOAD_IMG_OVER_TIME, 1)
    }
  }

  /** 微信控件返回失败回调 */
  private wxUploadImgFail(err: any, ): void {
    if (this.isCancelUpload(err)) { return }
    wxlog.setFilterMsg("upload")
    wxlog.error("选择图片失败", err)
    wx.showToast({
      title: "选择图片失败",
      duration: 2000,
    })
    this.aliMonitor.sum(PerformanceMonitorId.SELECT_IMG_FAIL, 1)
  }

  /** 阿里云上传失败回调 */
  private aLiYunUploadImgFail(err: any): void {
    wxlog.setFilterMsg("upload")
    wxlog.error("图片上传失败", err)
    wx.showToast({
      title: "图片上传失败",
      icon: "none",
      duration: 2000,
    })
    this.aliMonitor.sum(PerformanceMonitorId.UPLOAD_IMG_FAIL, 1)
  }

  /** 是否取消选择图片 */
  private isCancelUpload(err: any): boolean {
    // err is string
    return (err.indexOf && err.indexOf("cancel") >= 0)
      // or err is Object And err.errMsg is string
      || (err.errMsg && err.errMsg.indexOf && err.errMsg.indexOf("cancel") >= 0)
  }

  private getUploadFileFormData(imgSrc: string, scope: "public" | "private" = "public"): Observable<any> {
    const url = this.addHost("/sys/upload/get_pre_oss_info")
    return this.httpClient.post(url, {
      body: {
        fileName: imgSrc,
        scope,
      },
    }).pipe(map(({ data }: any) => {
      return {
        host: data.host,
        name: imgSrc,
        key: data.filename,
        policy: data.policy,
        OSSAccessKeyId: data.accessId,
        success_action_status: "200",
        signature: data.signature,
      }
    }))
  }

  /** 为url添加前缀 */
  private addHost(url: string): string {
    return (url.includes(config.host) || url.includes("http")) ? url : `${config.host}${url}`
  }

  ///////////////////////////// 视频处理函数 - start /////////////////////////////////

  /** 成功处理 */
  private processVideoSuc(
    res: wx.ChooseVideoSuccessCallbackResult,
    observer: Observer<any>,
    options: IVIdeoUploadOtherOptions,
  ): void {
    options = Object.assign({ ... this.defaultVideoOtherOptions }, { ... options })
    const errCallBack = (errMsg: string, isShowModal: boolean = true): void => {
      wx.showModal({
        title: "错误",
        content: errMsg,
        showCancel: false,
      })
      observer.error({ errMsg })
      observer.complete()
      return
    }
    if (options.limitMaxSize && res.size > this.getSizeMB(options.limitMaxSize)) {
      return errCallBack(`请上传小于或等于${options.limitMaxSize}M的视频`)
    }
    if (options.limitSelectedTime && res.duration > options.limitSelectedTime) {
      return errCallBack(`视频时间大于${options.limitSelectedTime}秒，请重新选择`, false)
    }
    wx.showLoading({
      title: "上传中",
      mask: true,
    })
    const tempFilePath = res.tempFilePath
    this.getUploadFileFormData(tempFilePath).subscribe((formData: any) => {
      wx.uploadFile({
        url: formData.host,
        filePath: tempFilePath,
        name: "file",
        formData,
        success(uploadRes: wx.UploadFileSuccessCallbackResult): void {
          wx.showToast({
            title: "上传成功",
            icon: "success",
            duration: 2000,
          })
          try {
            if (formData.key[0] !== "/") { formData.key = "/" + formData.key}
            observer.next({ path: formData.key })
          } catch (e) {
            console.error("parse uploadRes error:", e)
            observer.error({ errMsg: "解析上传数据错误" })
          }
        },
        complete(): void {
          wx.hideLoading({})
          observer.complete()
        },
      })
    })
  }

  /** 失败处理 */
  private processVideoFail(e: any, observer: Observer<any>): void {
    wxlog.setFilterMsg("upload")
    wxlog.error("图片上传失败", e)
    observer.error({ errMsg: "chooseVideo fail" })
    observer.complete()
  }

  ///////////////////////////// 视频处理函数 - end /////////////////////////////////

}
