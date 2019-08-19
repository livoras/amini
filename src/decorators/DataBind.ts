/** 输入框绑定返回值类型 */
type DataBindResultFunction = (target: any, propName: string, descriptor: PropertyDescriptor) => void

/**
 * 【装饰器】自动将 e.detail.value 的值 setData 到 key
 * @decorator
 * @example
 * ```
 * // ts
 * @databind('a.b', (v) => v + 1)
 * public handleInput() {}
 * // wxml
 * <input bindinput="handleInput"></input>
 * ```
 */
export const DataBind = (dataKey: string, mapper?: (v: string) => any): DataBindResultFunction => (
  target: any, propName: string, descriptor: PropertyDescriptor,
): void => {
  const oldFunc = descriptor.value
  descriptor.value = function(this: Page.PageInstance, e: WXEvent): void {
    const rawValue = e.detail.value
    const value = mapper ? mapper(rawValue) : rawValue
    this.setData({ [dataKey]: value })
    oldFunc.call(this, e)
  }
}
