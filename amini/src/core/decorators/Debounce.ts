/**
 * 函数防抖，避免多次触发
 * ```typescript
 * @Debounce(100)
 * public handleInputMessage(e: WXEvent) {
 *   // ...
 * }
 * ```
 */
export function Debounce(timeout: number = 100): MethodDecorator {
  return (
    target: any, key: string | symbol, descriptor: PropertyDescriptor,
  ): void => {
    const originFunc: (...args: any[]) => any = descriptor.value
    let timer: any
    // tslint:disable-next-line: only-arrow-functions
    descriptor.value = function(...args: any[]): any {
      if (timer) { clearTimeout(timer) }
      timer = setTimeout(() => {
        originFunc.call(this, ...args)
      }, timeout)
    }
  }
}
