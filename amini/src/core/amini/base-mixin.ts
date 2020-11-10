
type Constructor<T> = new(...args: any[]) => T

const isAbstract = Symbol("isAbstract")

type Mixin = <T1 = {}, T2 = {}, T3 = {}, T4 = {}, T5 = {}, T6 = {}, T7 = {}>(
  C1?: Constructor<T1>,
  C2?: Constructor<T2>,
  C3?: Constructor<T3>,
  C4?: Constructor<T4>,
  C5?: Constructor<T5>,
  C6?: Constructor<T6>,
  C7?: Constructor<T7>,
) => {
  // tslint:disable-next-line:callable-types
  new(): T1 & T2 & T3 & T4 & T5 & T6 & T7,
}

interface ICreateOptions {
  beforeMixin?: (baseCtors: Array<Constructor<any> | undefined>) => any
  beforeFinishMixin?: (baseCtors: Array<Constructor<any> | undefined>, Super: Constructor<any>) => any
  prototypeWillApply?: (baseCtors: Constructor<any>, Super: Constructor<any>) => any
  prototypeDidApply?: (baseCtors: Constructor<any>, Super: Constructor<any>, instance: any) => any
}

export const createMixin = (options: ICreateOptions = {}): Mixin => {
  return <T1 = {}, T2 = {}, T3 = {}, T4 = {}, T5 = {}, T6 = {}, T7 = {}>(
    C1?: Constructor<T1>,
    C2?: Constructor<T2>,
    C3?: Constructor<T3>,
    C4?: Constructor<T4>,
    C5?: Constructor<T5>,
    C6?: Constructor<T6>,
    C7?: Constructor<T7>,
  ): {
    // tslint:disable-next-line:callable-types
    new(): T1 & T2 & T3 & T4 & T5 & T6 & T7,
  } => {
    const { beforeMixin, beforeFinishMixin } = options
    const baseCtors = [C1, C2, C3, C4, C5, C6, C7]
    if (beforeMixin) { beforeMixin(baseCtors) }
    // tslint:disable-next-line: max-classes-per-file
    class Super {
      constructor() {
        // 如果子类没有实现抽象方法，那么就会获取到原型链上父类的方法，存在isAbstract就报错
        const subClassName = Object.getPrototypeOf(this).constructor.name
        baseCtors.forEach((ctor: any) => {
          if (!ctor) { return }
          // 收集抽象方法列表
          const abstractMethodList: string[] = []
          Object.keys(ctor.prototype).forEach((method: string) => {
            if (ctor.prototype[method] && ctor.prototype[method][isAbstract]) {
              abstractMethodList.push(method)
            }
          })
          // 检查子类是否实现抽象方法
          abstractMethodList.forEach((method: string) => {
            console.error(!this[method][isAbstract],  `${subClassName} 必须要实现父类 ${ctor.name} 的抽象方法: ${method}`)
          })
        })
      }
    }
    baseCtors.filter((ctor: any) => !!ctor)
      .forEach((baseCtor: any) => {
        applyMixin(baseCtor, Super, options)
      })
    delete (Super.prototype as any).__extendedClasses__
    if (beforeFinishMixin) { beforeFinishMixin(baseCtors, Super) }
    return Super as any
  }
}

/**
 * @param baseCtor 需要mixin引入的 class
 * @param Super 宿主
 */
function applyMixin(baseCtor: Constructor<any>, Super: Constructor<any>, options: ICreateOptions): void {
  if (!baseCtor || !baseCtor.prototype) { return }
  const { prototypeWillApply, prototypeDidApply } = options
  if (prototypeWillApply) { prototypeWillApply(baseCtor, Super) }
  const extendedClasses: Set<any> = Super.prototype.__extendedClasses__
  if (extendedClasses && extendedClasses.has(baseCtor)) { return }
  const baseCtorParentCtor = (baseCtor as any).__proto__
  // if (parentProto !== Object && parentProto !== null) {
  if (baseCtorParentCtor) {
    // mixin 的类会继承其他类，因此需要递归复制属性方法
    applyMixin(baseCtorParentCtor, Super, options)
  }
  // 塞入方法
  Object.assign(Super.prototype, baseCtor.prototype)
  // 塞入属性
  const instance = new baseCtor()
  Object.assign(Super.prototype, instance)
  // 记录继承过的类名
  Super.prototype.__extendedClasses__ = (Super.prototype.__extendedClasses__ || new Set()).add(baseCtor)
  if (prototypeDidApply) { prototypeDidApply(baseCtor, Super, instance) }
}

/** 声明为抽象方法，子类必须实现 */
export const Abstract = (): MethodDecorator => {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): void => {
    // 标记父类的函数
    target[propertyKey][isAbstract] = true
  }
}
