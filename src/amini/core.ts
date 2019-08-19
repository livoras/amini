import "./Reflect"
// TODO: 由于循环引用，取消掉子类继承检查，如何解决
// import { SuperPage } from "@core/classes/SuperPage"
// import { SuperComponent } from "@core/classes/SuperComponent"

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
  Page(convertInstanceToRawObject(page))
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
  const plainObject = convertInstanceToRawObject(component)
  Component(cacheCustomProp(plainObject))
}

/** 组件生命周期 */
const compLifetimes = ["created", "attached", "ready", "moved", "detached", "error"]
/** 组件可监听的页面生命周期 */
const compPageLifetimes = ["show", "hide", "resize"]

/**
 * 组件注册时将方法写入到对应的methods lifetimes 对象，只需处理第一层
 * FIXME: 如果组件继承了其他类，那么就不能获取到更深原型链的方法, 需要遍历原型链
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
    } else if (typeof proto[key] === "function") {
      component.methods[key] = proto[key]
    }
  })
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
  return Behavior(convertInstanceToRawObject(behavior))
}

/**
 * 微信小程序主启动接口的装饰器
 */
export const wxApp = (options?: any): AcceptClassFunction => (AppClass: IClass): void => {
  removeFakeSetDataOnProto(AppClass)
  const app = new AppClass(...getDependenciesOfService(AppClass))
  const plainObject = convertInstanceToRawObject(app)
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

/**
 * 把一个某个类的实例对象的属性和原型上的属性抽离出来合成一个对象
 * 但是把 constructor 去掉，因为微信小程序不知道什么原理，有 constructor 属性就会报错！
 *
 * 这里可以把多继承最后的结果进行合并
 */
export const convertInstanceToRawObject = (instance: any): any => {
  /** 获取原型链 */
  const proto = instance.__proto__

  /** 如果是原生对象，那么不需要再追溯 */
  const isRawObject = proto.constructor === Object
  if (isRawObject) { return makeOwnKeysObject(instance) }

  /** 把所有的原型链上的数据，按照原型链追溯以后的结果合并在一起放到一个对象当中 */
  return {
    ...convertInstanceToRawObject(proto),
    ...makeOwnKeysObject(instance),
  }
}

/**
 * 把一个实例的非原型上的数据合并到一个新的对象当中
 */
const makeOwnKeysObject = (instance: any): any => [...Reflect.ownKeys(instance)]
  .reduce((obj: any, key: any) => {
    if (key === "constructor") { return obj }
    obj[key] = instance[key]
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
