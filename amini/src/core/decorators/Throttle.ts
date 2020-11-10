/**
 * 函数节流，避免多次触发
 * ```typescript
 * @Throttle(100)
 * public handleInputMessage(e: WXEvent) {
 *   // ...
 * }
 * ```
 */
export function Throttle(timeout: number = 100): MethodDecorator {
  return (
    target: any, key: string | symbol, descriptor: PropertyDescriptor,
  ): void => {
    const originFunc: (...args: any[]) => any = descriptor.value
    let timer: any
    let last: any
    descriptor.value = function(...args: any[]): any {
      const now = +new Date()
      if (last && now < last + timeout) {
        clearTimeout(timer)
        timer = setTimeout(() => {
          last = now
          originFunc.apply(this, args)
        }, timeout)
      } else {
        last = now
        originFunc.apply(this, args)
      }
    }
  }
}
