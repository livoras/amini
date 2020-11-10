/**
 * 防止内存泄漏
 *
 * const noLeak = new NoLeak<XXXPage>()
 * const intersectionListener = noLeak.wrap((a, b, c, p: XXXPage) => {
 *    // use p as XXXPage here
 * })
 *
 * class XXXPage {
 *   public listen(): void {
 *     noLeak.push(this)
 *     someCallback(intersectionListener)
 *     this.unloadObservable.subscribe(() => {
 *       noLeak.pop()
 *     })
 *   }
 * }
 */
export class NoLeak<P> {
  public instances: P[] = []

  // tslint:disable-next-line: ban-types
  public wrap<T extends Function>(func: T): T {
    const wrapper = (...args: any[]): any => {
      return func(...args, this.latestInstance())
    }
    return wrapper as any
  }

  public latestInstance(): P {
    return this.instances[this.instances.length - 1]
  }

  public push(p: P): void {
    this.instances.push(p)
  }

  public pop(): void {
    this.instances.pop()
  }
}
