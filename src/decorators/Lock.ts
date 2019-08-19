/** 解锁函数 */
export type Unlock = () => void

/**
 * 函数锁定装饰器，避免多次触发。需要调用最后一个插入的参数来 解锁
 * @param timeout 超时后自动解锁，默认 3000 ms
 * ```js
 * @Lock(4000)
 * function(a,b, unlock: Unlock) { unlock() }
 * ```
 */
export const Lock = (timeout: number = 3000): MethodDecorator => (
  target: any, key: string | symbol, descriptor: PropertyDescriptor,
): void => {
  let locking = false
  let timer: any
  let lastReturn: any
  const originFunc: (...args: any[]) => any = descriptor.value
  descriptor.value = function(...args: any[]): any {
    if (locking) { return lastReturn }
    const unlock: Unlock = (): void => { locking = false }
    locking = true
    if (timer) { clearTimeout(timer) }
    timer = setTimeout(unlock, timeout)
    lastReturn = originFunc.apply(this, args.concat(unlock))
    return lastReturn
  }
}
