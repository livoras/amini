import { Computed } from "./computed"
import { getInstanceByServiceOrCacheIfNotExist } from "@angular/core"
import { PerformanceMonitorService } from "@core/services/performance-monitor.service"

export interface ISuperDataObj<U> {
  /**
   * 根据 key 获取子级的 SuperData 对象
   * @param key 子级的 key
   */
  use: <K extends keyof U>(key: K) => ISuperData<Exclude<U[K], undefined | null>>
  /**
   * 根据 path 获取更深层级的 SuperData 对象
   * @param path 路径，不需要写本层 key
   */
  usePath: <K>(path: string) => ISuperData<K>
  /**
   * 修改 key 对应的值
   * @param key 需要修改的属性名
   * @param value 需要修改的属性值
   * @param cb 回调
   */
  set: <K extends keyof U>(key: K, value: U[K], cb?: () => any) => ISuperData<U>
  /**
   * 批量修改 key 对应的值
   * @param setDataObject，类似于 Object.assign 的第二个参数
   * @param cb 回调
   */
  assign: (setDataObject: Partial<U>, cb?: () => any) => ISuperData<U>
  // find: <K>(condition: string | ((item: any, index: number) => boolean)) => ISupperData<K> | undefined
  // replace: (obj: any) => void
}

export type ISuperData<U> = ISuperDataObj<U> & U

export type getter<D, T> = (data: D) => T
export type ComputedDef<IDATA, ICOMPUTED> = {
  [T in keyof ICOMPUTED]: getter<IDATA, ICOMPUTED[T]>
}
/**
 *  封装 wx setData
 *  注意：不要直接继承， page component 使用对应的基类
 */
export class SuperSetData<T, Z = T> implements Page.PageInstance<T> {

  public data!: T
  public computedInstance?: Computed<T>

  public readonly setData!: (obj: Partial<T>, cb?: () => void) => void

  public computedDepsMap?: any
  public computedWatchers?: any
  public computed?: object

  private setDataTimer: any
  private setDataObject: object = {}
  private setDataCallbackList: AnyFunction[] = []
  private monitorInSuperSetData: PerformanceMonitorService

  constructor() {
    /** 底层使用service，直接捞取，防止报错 */
    this.monitorInSuperSetData = getInstanceByServiceOrCacheIfNotExist(PerformanceMonitorService)
  }

  /** 创建一个基于 data 的 SuperData 对象 */
  public use(): ISuperData<Z>
  /** 创建一个基于 data.key 的 SuperData 对象 */
  public use<K extends keyof Z>(key?: K): ISuperData<Exclude<Z[K], undefined | null>>
  public use<K extends keyof Z>(key?: K): ISuperData<Exclude<Z[K], undefined | null>> {
    return this.realUse<Exclude<Z[K], undefined | null>>(key as any)
  }

  public usePath<U>(rootPath: string = ""): ISuperData<U> {
    return this.realUse<U>(rootPath)
  }

  /**
   * 根据路径创建一个 SuperData 对象
   * @param {string} rootPath 路径，比如 "form"，不需要写 "data"，若不传路径，则默认创建的是以 data 本身为基础的 SuperData 对象
   */
  // tslint:disable-next-line:cognitive-complexity no-big-function
  public realUse<U>(rootPath: string = ""): ISuperData<U> {

    // TODO: 如果此时 this.data.rootPath 还没有，该怎么办？
    const data = this.getByProps(this.data, rootPath)

    const superData = {} as ISuperData<U>

    superData.use = <K extends keyof U>(key: K): ISuperData<Exclude<U[K], undefined | null>> => {
      if (typeof key === "number") {
        return this.realUse<Exclude<U[K], undefined | null>>(`${rootPath}[${key}]`)
      } else {
        return this.realUse<Exclude<U[K], undefined | null>>(`${rootPath}.${key}`)
      }
    }

    superData.usePath = <K>(path: string): ISuperData<K> => {
      return this.realUse<K>(`${rootPath}.${path}`)
    }

    superData.assign = <K extends keyof U>(setDataObject: Partial<U>, cb?: () => void): ISuperData<U> => {
      if (cb) { this.setDataCallbackList.push(cb) }
      for (const [key, value] of Object.entries(setDataObject)) {
        this.setDataObject[`${rootPath}.${key}`] = value
      }
      this.execThrottledSetData()
      return superData
    }

    superData.set = <K extends keyof U>(key: K, value: U[K], cb?: () => any): ISuperData<U> => {
      try {
        if (cb) { this.setDataCallbackList.push(cb) }
        if (typeof key === "number") {
          this.setDataObject[`${rootPath}[${key}]`] = value
        } else {
          this.setDataObject[`${rootPath}.${key}`] = value
        }
        this.execThrottledSetData()
        return superData
      } catch (e) {
        this.monitorInSuperSetData.sum("set 失败")
        throw new Error(`set 失败，${e}`)
      }
    }

    // superData.replace = (value: any, cb?: () => any): void => {
    //   this.setDataObject[`${rootPath}`] = value
    //   if (cb) { this.setDataCallbackList.push(cb) }
    //   this.execThrottledSetData()
    // }

    // TODO: 暂时不完善，先放置，以后有需求再优化
    // tslint:disable-next-line:max-line-length
    // superData.find = <K>(condition: string | ((item: any, index: number) => boolean)): ISuperData<K> | undefined => {
    //   if (typeof condition === "string") {
    //     const finalKeys: string[] = []
    //     let finalPath: string = ""
    //     const parsedCondition = condition.split(/\.|(\[.*?\])/).filter((item) => item)
    //     for (const key of parsedCondition) {
    //       if (!key.includes("[")) {
    //         finalKeys.push(key)
    //         finalPath += `.${key}`
    //       } else if (!/<|>|=/.test(key)) {
    //         finalKeys.push(key.replace(/[|]/g, ""))
    //         finalPath += `${key}`
    //       } else {
    //         const currentObj = finalKeys.reduce((result, current) => {
    //           return result[current]
    //         }, data)
    // tslint:disable-next-line:max-line-length
    //         let findRule = key.replace(/\[|\]/g, "").split(/(<|>|=)/).filter((item) => item).map((item) => item.trim())
    //         if (findRule.length === 4) {
    //           findRule = [findRule[0], findRule[1] + findRule[2], findRule[3]]
    //         }
    //         console.log(findRule)
    //         if (currentObj instanceof Array) {
    //           const resIndex = currentObj.findIndex((item: any, index: number) => {
    //             if (findRule[1] === ">") {
    //               return item[findRule[0]] > findRule[2]
    //             } else if (findRule[1] === ">=") {
    //               return item[findRule[0]] >= findRule[2]
    //             } else if (findRule[1] === "=") {
    //               return item[findRule[0]] === findRule[2]
    //             } else if (findRule[1] === "<=") {
    //               return item[findRule[0]] <= findRule[2]
    //             } else {
    //               return item[findRule[0]] < findRule[2]
    //             }
    //           })
    //           console.log(resIndex)
    //           if (resIndex === -1) { return undefined }
    //           finalKeys.push(`${resIndex}`)
    //           finalPath += `[${resIndex}]`
    //         } else {
    //           throw new Error("暂时不支持该种数据类型的 find 方法")
    //         }
    //       }
    //     }
    //     return this.use(`${rootPath}${finalPath}`)
    //   } else {
    //     if (data instanceof Array) {
    //       const resIndex = data.findIndex((item: any, index: number) => condition(item, index))
    //       return resIndex !== -1 ? this.use(`${rootPath}[${resIndex}]`) : undefined
    //     } else {
    //       throw new Error("暂时不支持该种数据类型的 find 方法")
    //     }
    //   }
    // }

    Object.setPrototypeOf(superData, data)

    return superData
  }

  /**
   * @deprecated 【因性能和代码规范问题，不再支持，推荐使用 use】
   *
   * 注意如果某个对象不存在与 Data，那么
   * 对某个对象的某个属性进行改变,并与视图同步
   * 类似于 vue.js 中的 this.$set
   *
   * @param {U} target 要设置的对象
   * @param {K} key 属性名
   * @param {U[K]} value  属性值
   * @memberof SuperSetData
   */
  // tslint:disable-next-line:max-line-length
  public setValue<U extends object, K extends keyof U>(
    target: U,
    key: K,
    value: U[K],
    callback?: AnyFunction,
  ): void {
    if (target === undefined || key === undefined) {
      console.error("target 和 key 不可为 undefined")
      return
    }
    // 要判断是否是undefined，不能用!value判断
    if (value === undefined || target[key] === value) {
      return
    }

    let fullPathWithKey = ""
    let targetPathArr: string[] = []
    /** 直接设置 Data */
    if (target === this.data as any) {
      fullPathWithKey = key as string
    } else {
      targetPathArr = getValueFullPaths(this.data, target)
      if (!targetPathArr.length) {
        console.error("setValue target 不存在于 this.data 中")
        return
      }
      const targetPathsStr = paths2str(targetPathArr)
      fullPathWithKey = resolvePaths(targetPathsStr, key as string | number)
    }
    if (callback) { this.setDataCallbackList.push(callback) }
    this.setDataObject[fullPathWithKey] = value
    // 先赋值保证同步流程，后渲染
    // 此处要将路径展开赋值
    let parent: any = this.data
    targetPathArr.forEach((path: string) => {
      parent = parent[path]
    })
    parent[key] = value
    // throttle
    if (this.setDataTimer) { return }
    this.setDataTimer = setTimeout(() => {
      this.processSetData()
      this.setDataTimer = null
    }, 100)
  }

  private execThrottledSetData(): void {
    if (this.setDataTimer) { return }
    this.setDataTimer = setTimeout(() => {
      try {
        this.processSetData()
      } catch {
        this.monitorInSuperSetData.sum("setData 或回调执行失败")
        throw new Error("setData 或回调执行失败")
      }
      this.setDataTimer = null
    }, 100)
  }

  /** 真正渲染 */
  private processSetData(): void {
    const cbList = this.setDataCallbackList.slice()
    const data = Object.assign({}, this.setDataObject)
    this.setDataObject = {}
    this.setDataCallbackList = []
    this.setData(data, () => {
      cbList.forEach((cb) => cb())
    })
  }

  private getByProps(obj: T, path: string): any {
    const keys = path.split(/\.|\[|\]/).filter((item) => item)
    try {
      return keys.reduce((result, current) => {
        if (!result[current]) {
          throw new Error(`数据的路径 ${path} 错误，属性 ${current} 不存在`)
        }
        return result[current]
      }, obj)
    } catch (e) {
      this.monitorInSuperSetData.sum("use 的数据路径不存在")
      throw new Error(e)
    }
  }
}

/**
 * 获取对象某属性值的完整属性名路径, TODO: 尾递归
 *
 * @private
 * @param {(T | object)} parent
 * @param {*} target
 * @param {string[]} [paths=[]]
 * @returns {string[]}
 * @memberof SuperSetData
 */
export const getValueFullPaths = (parent: any, target: any, paths: string[] = []): string[] => {
  const keys = Object.keys(parent)
  let findResult: string[] = []
  keys.some((key: string): boolean => {
    const currentValue = parent[key]
    if (currentValue && currentValue === target) {
      paths.push(key)
      findResult = paths
      return true
    } else if (currentValue && typeof currentValue === "object") {
      findResult = getValueFullPaths(currentValue as object, target, paths.concat([key]))
      return findResult.length > 0
    }
    return false
  })
  return findResult
}

/**
 * 将以数组组成的 path 转换为 this.setData 能接收的字符串拼接形式
 *
 * @private
 * @param {string[]} paths
 * @returns {string}
 * @memberof SuperSetData
 */
export const paths2str = (paths: string[]): string => {
  let result = ""
  paths.forEach((key: string): void => {
    result = resolvePaths(result, key)
  })
  return result
}

/**
 * 以 this.setData 的形式拼接路径
 *
 * @private
 * @param {string} path
 * @param {(string | number)} key
 * @returns {string}
 * @memberof SuperSetData
 */
export const resolvePaths = (path: string = "", key: string | number): string => {
  let result = path
  key = String(key)
  if (/^\d*$/.test(key)) {
    result += `[${key}]`
  } else if (result === "") {
    result = key
  } else {
    result += `.${key}`
  }
  return result
}
