
declare namespace Component {

  /**
   * trigger options
   */
  interface ITriggerOptions {
    bubbles?: boolean,
    composed?: boolean,
    capturePhase?: boolean,
  }
  /**
   * 组件关系类型
   */
  type RelationType = "child" | "parent" | "ancestor" | "descendant"

  /**
   * 组件参数类型 定义 properties 用
   */
  type PropType = NumberConstructor | StringConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor | null

  interface IProperties<Data> {
    /** key: Class 定义属性 */
    [prop: string]: {
      /** 类型 */
      type: PropType,
      /** 默认值 */
      value?: any,
      // TODO: 怎么可以定义 this 为子类
      /** 监听器 */
      observer?: (this: ComponentInstance<Data>, newValue: any, oldValue: any, path: string) => void,
    } | PropType,
  }

  interface IRelations {
    [pathOrBehavior: string]: {
      type: RelationType,
      target?: any,
      linked?(target: ComponentInstance): void
      linkChanged?(target: ComponentInstance): void
      unlinked?(target: ComponentInstance): void
    }
  }

  interface ComponentInstance<D extends IAnyObject = any, T extends IAnyObject = any> {
    /** 页面的初始数据
      * 
      * `data` 是页面第一次渲染使用的**初始数据**。
      * 
      * 页面加载时，`data` 将会以`JSON`字符串的形式由逻辑层传至渲染层，因此`data`中的数据必须是可以转成`JSON`的类型：字符串，数字，布尔值，对象，数组。
      * 
      * 渲染层可以通过 `WXML` 对数据进行绑定。
     */
    data?: D

    /** `setData` 函数用于将数据从逻辑层发送到视图层（异步），同时改变对应的 `this.data` 的值（同步）。
     *
     * **注意：**
     *
     * 1. **直接修改 this.data 而不调用 this.setData 是无法改变页面的状态的，还会造成数据不一致**。
     * 1. 仅支持设置可 JSON 化的数据。
     * 1. 单次设置的数据不能超过1024kB，请尽量避免一次设置过多的数据。
     * 1. 请不要把 data 中任何一项的 value 设为 `undefined` ，否则这一项将不被设置并可能遗留一些潜在问题。
     */

    setData?<K extends keyof D>(
      /** 这次要改变的数据
       *
       * 以 `key: value` 的形式表示，将 `this.data` 中的 `key` 对应的值改变成 `value`。
       *
       * 其中 `key` 可以以数据路径的形式给出，支持改变数组中的某一项或对象的某个属性，如 `array[2].message`，`a.b.c.d`，并且不需要在 this.data 中预先定义。
       */
      data: D | Pick<D, K> | IAnyObject,
      /** setData引起的界面更新渲染完毕后的回调函数，最低基础库： `1.5.0` */
      callback?: () => void
    ): void
    /** 外部传入的样式属性名，内部使用就是当className 来用 */
    externalClasses?: string[]
    relations?: IRelations
    behaviors?: any[]
    properties?: IProperties
    methods?: {
      [key: string]: (...args: any[]) => any
    }
    /** 2.2.3 启用 */
    lifetimes?: {
      created?(): void
      ready?(): void
      attached?(): void
      moved?(): void
      detached?(): void
      error?(err: any): void
    }
    /** 2.2.3 */
    pageLifetimes?: {
      show?(): void
      hide?(): void
      resize?(size: any): void
    }
    /** 2.2.3 */
    definitionFilter?(defFields: any, definitionFilterArr: any[]): void
    options?: any
    observers?(keys: string): (...args: any[]) => void
    created?(): void
    ready?(): void
    attached?(): void
    moved?(): void
    detached?(): void
    /** 2.4.1 */
    error?(err: any): void

    triggerEvent?(name: string, detial: any, options: ITriggerOptions): void
    
  }

  interface ComponentConstructor {
    <D extends IAnyObject, T extends IAnyObject & ComponentInstance>(
      options: ComponentInstance<D, T> & T
    ): void
  }

}

declare const Component: Component.ComponentConstructor
