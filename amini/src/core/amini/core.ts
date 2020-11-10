import "./Reflect"
// TODO: 由于循环引用，取消掉子类继承检查，如何解决
// import { SuperPage } from "@core/classes/SuperPage"
// import { SuperComponent } from "@core/classes/SuperComponent"

export const mixinInjectorSymbol = Symbol("mixinInjectorSymbol")

export type IClass = new (...args: any[]) => any

type AcceptClassFunction = (Clazz: IClass) => void

/**
 * 微信小程序每个页面的装饰器
 * @param options
 */
export const wxPage = (options?: any): AcceptClassFunction => (PageClass: IClass): void => {
  removeFakeSetDataOnProto(PageClass)
  // checkInheritance(SuperPage, PageClass)
  const page = new PageClass(...getDependenciesOfService(PageClass))
  Page(convertInstanceToRawObjectWithFakeMixinInject(page))
}

/**
 * 微信小程序每个组件的装饰器
 * 除了组件生命周期，所有方法都需要定义在 methods 里才能使用
 * @param options
 */
export const wxComponent = (options?: any): AcceptClassFunction => (ComponentClass: IClass): void => {
  removeFakeSetDataOnProto(ComponentClass)
  // checkInheritance(SuperComponent, ComponentClass)
  const component = new ComponentClass(...getDependenciesOfService(ComponentClass))
  injectMethodsAndLifetimes(component)
  const plainObject = convertInstanceToRawObjectWithFakeMixinInject(component)
  Component(cacheCustomProp(plainObject))
}

/** 组件生命周期 */
const compLifetimes = ["created", "attached", "ready", "moved", "detached", "error"]
/** 组件可监听的页面生命周期 */
const compPageLifetimes = ["show", "hide", "resize"]
/** 不能写入组件 methods 的，在 SuperComponent 或 SuperSetData 中定义的空函数 */
const fakeFunctions = ["triggerEvent", "setData"]

/**
 * 组件注册时将方法写入到对应的 methods lifetimes 对象，注意 lifetimes 和 pageLifetimes 只会获取一层（当前组件这一层）
 */
function injectMethodsAndLifetimes(component: any): void {
  const proto = component.__proto__
  component.methods = component.methods || {}
  component.lifetimes = component.lifetimes || {}
  component.pageLifetimes = component.pageLifetimes || {}
  Reflect.ownKeys(proto).forEach((key: any) => {
    if (key === "constructor") { return }
    if (compLifetimes.includes(key)) {
      component.lifetimes[key] = proto[key]
    } else if (compPageLifetimes.includes(key)) {
      component.pageLifetimes[key] = proto[key]
    }
  })
  injectMethods(component, component.methods)
}

/**
 * 获取组件继承的父级的 methods，需要排除一些空方法，防止页面的方法被覆盖掉
 */
function injectMethods(component: any, methods: any): any {
  const proto = component.__proto__
  const isRawObject = proto.constructor === Object
  if (isRawObject) { return }
  Reflect.ownKeys(proto).forEach((key: any) => {
    if (
      !compLifetimes.includes(key) && !compPageLifetimes.includes(key) && !fakeFunctions.includes(key)
      && key !== "constructor" && typeof proto[key] === "function"
    ) {
      methods[key] = proto[key]
    }
  })
  injectMethods(proto, methods)
}

/** 组件官方属性 */
const compPropertyKeys: Array<keyof Component.ComponentInstance> = [
  "externalClasses",
  "behaviors",
  "relations",
  "data",
  "properties",
  "methods",
  "lifetimes",
  "pageLifetimes",
  "definitionFilter",
  "options",
  "setData",
]

/** 标记是否依赖注入的服务，用于判断属性是否需要被深复制 */
const isService = Symbol("is service")

/**
 * 组件class 的非官方属性在小程序注册时都会被清除，为了使用依赖注入，要做适配，
 * 将自定义属性储存起来，created 的时候释放出来
 */
function cacheCustomProp(obj: Component.ComponentInstance): Component.ComponentInstance {
  // FIXME: 注意是否会内存泄漏
  // 非依赖注入的对象都需要使用深复制，避免同一个组件的多个实例共享属性
  const customProperties = {}
  Reflect.ownKeys(obj).forEach((key: any) => {
    if (compPropertyKeys.includes(key) || typeof obj[key] === "function") { return }
    if (obj[key] && obj[key][isService]) {
      // 服务使用单例
      customProperties[key] = obj[key]
    } else {
      // 其他自定义属性要有独立的引用
      // 注意：如果 组件初始化有自身循环引用的对象，就会 爆栈报错。
      customProperties[key] = deepClone(obj[key])
    }
  })
  const originCreated = obj.created
  // 组件会创建不同的实例，而这些实例是没有自定义属性的，所以每次都要赋值给 this
  const newCreated = function(this: Component.ComponentInstance): void {
    Object.assign(this, customProperties)
    if (typeof originCreated === "function") { originCreated.call(this) }
    // 给 this 赋值 created 无效
  }
  obj.lifetimes = Object.assign(obj.lifetimes || {}, { created: newCreated })
  obj.created = newCreated
  return obj
}

/** 微信小程序定义 Behavior 装饰器 */
export const wxBehavior = (options?: any): AcceptClassFunction => (BehaviorClass: IClass): void => {
  removeFakeSetDataOnProto(BehaviorClass)
  const behavior = new BehaviorClass(...getDependenciesOfService(BehaviorClass))
  return Behavior(convertInstanceToRawObjectWithFakeMixinInject(behavior))
}

/**
 * 微信小程序主启动接口的装饰器
 */
export const wxApp = (options?: any): AcceptClassFunction => (AppClass: IClass): void => {
  removeFakeSetDataOnProto(AppClass)
  const app = new AppClass(...getDependenciesOfService(AppClass))
  const plainObject = convertInstanceToRawObjectWithFakeMixinInject(app)
  // 不生成App，只返回配置对象，交给后面编译
  if (options && options.plainObject) {
    return plainObject
  }
  App(plainObject)
}

/**
 * 删除用来提示的，没什么卵用的 setData
 * @param Class 类
 */
const removeFakeSetDataOnProto = (Class: IClass): void => {
  // FIXME: 遍历原型链 删除 setData
  delete Class.prototype.__proto__.setData
}

/** 检查类是否继承自指定的父类 */
const checkInheritance = (parent: IClass, child: IClass): void => {
  // mixin 检查特殊字段
  const childExtendedClassesSet: Set<any> = child.prototype.__extendedClasses__ || new Set()
  const isInherited = parent.isPrototypeOf(child) || childExtendedClassesSet.has(parent)
  if (!isInherited) {
    throw new Error(`"${child.name}" 必须继承自 "${parent.name}"`)
  }
  return
}

const convertInstanceToRawObjectWithFakeMixinInject = (instance: any): any => {
  const mixinProps: string[] = []
  const obj = convertInstanceToRawObject(instance, mixinProps)
  obj.__mixin_props__ = mixinProps
  return obj
}

/**
 * 把一个某个类的实例对象的属性和原型上的属性抽离出来合成一个对象
 * 但是把 constructor 去掉，因为微信小程序不知道什么原理，有 constructor 属性就会报错！
 *
 * 这里可以把多继承最后的结果进行合并
 */
export const convertInstanceToRawObject = (instance: any, mixinProps: string[]): any => {
  /** 获取原型链 */
  const proto = instance.__proto__

  /** 如果是原生对象，那么不需要再追溯 */
  const isRawObject = proto.constructor === Object
  if (isRawObject) { return makeOwnKeysObject(instance, mixinProps) }

  /** 把所有的原型链上的数据，按照原型链追溯以后的结果合并在一起放到一个对象当中 */
  return {
    ...convertInstanceToRawObject(proto, mixinProps),
    ...makeOwnKeysObject(instance, mixinProps),
  }
}

/**
 * 把一个实例的非原型上的数据合并到一个新的对象当中
 */
const makeOwnKeysObject = (instance: any, mixinProps: string[] = []): any => [...Reflect.ownKeys(instance)]
  .reduce((obj: any, key: any) => {
    if (key === "constructor") { return obj }
    const val = instance[key]
    if (val === mixinInjectorSymbol) {
      mixinProps.push(key)
    }
    obj[key] = val
    return obj
  }, {})

/******************** 依赖注入基础框架 *********************/

/**
 * 用来保存所有的 Service 单例
 * WeakMap 可以保证实例引用在完全使用完毕以后销毁，防止内存泄漏
 */
const servicesSingletonMap = new WeakMap()

/**
 * 模仿 Angular 的依赖注入函数，可以装饰类
 * 暂时不用做什么事情，毕竟是懒加载
 * @param options
 */
export const Injectable = (options?: any): AcceptClassFunction => (Service: IClass): void => {
  /** Lazy load without instantiating */
  // TODO: 也需要插入依赖，这样父类也可以有依赖
}

/**
 * 获取某个 Service 所依赖的其他 Service 实例
 * @param Service 需要处理的 Service
 */
export const getDependenciesOfService = (Service: IClass): any[] => {
  const dependentServices = Reflect.getMetadata("design:paramtypes", Service)
  const hasDeps = dependentServices && dependentServices.length
  if (!hasDeps) { return [] }
  /** 获取所依赖的 Service 的单例 */
  return dependentServices.map(getInstanceByServiceOrCacheIfNotExist)
}

/**
 * 通过 Service 类获取它的实例，如果在缓存当中没有，那么就实例化一个并且存储到缓存当中
 */
export const getInstanceByServiceOrCacheIfNotExist = <T>(Service: IClass): T => {
  let serviceInstance = servicesSingletonMap.get(Service)
  if (!serviceInstance) {
    /** 获取这个实例的依赖并且进行实例化 */
    const dependentServices = getDependenciesOfService(Service)
    serviceInstance = new Service(...dependentServices)
    /** 标记该对象为依赖注入的服务 */
    serviceInstance[isService] = true
    /** 设置到缓存当中 */
    servicesSingletonMap.set(Service, serviceInstance)
  }
  return serviceInstance
}

// FIXME: 解决循环引用
/** 深复制 */
function deepClone<T>(obj: T): T {
  if (!obj || typeof obj !== "object") { return obj }
  const clone: any = Object.assign({}, obj)
  // 避免循环引用 https://zhuanlan.zhihu.com/p/23251162
  Object.keys(clone).forEach(
    (key) => (clone[key] = obj[key] && typeof obj[key] === "object"
      ? deepClone(obj[key])
      : obj[key]),
  )

  return Array.isArray(obj) && obj.length
    ? ((clone).length = obj.length) && Array.from(clone)
    : Array.isArray(obj)
      ? Array.from(obj)
      : clone
}

/** 给 swagger 动态代码生成用的，暂时放这里 */
export const makeRequiredForFirst = (args: string[], r: number): { [x in string]: number } => {
  const ret = {}
  let i = args.length - 1
  while (r > 0) {
    // tslint:disable-next-line: no-bitwise
    const isRequired = (r & 1) > 0
    if (isRequired) { ret[args[i]] = 1 }
    // tslint:disable-next-line: no-bitwise
    r = r >> 1
    i--
  }
  return ret
}

export const mhttp = (prop: any): any => {
  const make = (m: string): any =>
  // tslint:disable-next-line: only-arrow-functions
  function(url: string, cName: string, args: string[] = [], r: number = 0): void {
    const n1 = Number(r)
    let required: { [x in string]: number }
    const surl = url.split(":")
    let tail = ""
    if (surl.length > 1) {
      [tail, url] = surl
    } else {
      url = surl[0]
    }
    // tslint:disable-next-line: typedef
    prop[cName + "Using" + m.toUpperCase() + tail]  = function(): any {
      let lurl = url
      const params = Array.prototype.slice.call(arguments)
      if (!required) {
        required = makeRequiredForFirst(args, n1)
      }
      // if (!pathVars) {
      //   pathVars = makeRequiredForFirst(args, n2)
      // }

      /**  检验数据 & 生成 data & url */
      const data = {}
      args.forEach((argName, i) => {
        const param = params[i]
        if (required[argName] && (param === null || param === undefined)) {
          throw new Error("参数 " + argName + " 必须传")
        }
        const newUrl = lurl.replace(new RegExp(`\\$${i}`, "g"), encodeURIComponent(String(param)))
        if (newUrl === lurl) {
          data[argName] = param
        } else {
          lurl = newUrl
        }
      })

      let options = {}
      if (params.length > args.length) {
        options = params[params.length - 1]
      }
      // console.log(url, args, params, required, data);
      return this.httpClient[m](lurl, data, options)
    }
  }
  const g = make("get")
  const p = make("post")
  const u = make("update")
  const d = make("delete")
  const t = make("put")
  const h = make("head")
  const o = make("options")
  const c = make("patch")
  return { g, p, u, d, t, h, o, c }
}

export const InjectMixin = (): PropertyDecorator => {
  return (target: any, prop: any): void => {
    target[prop] = mixinInjectorSymbol
  }
}
