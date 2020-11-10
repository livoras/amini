import { SuperComponent, getComponentData, IBaseComponentData } from "@core/classes/SuperComponent"
import { wxComponent } from "@angular/core"

/** 组件内部 data */
interface ICustomData extends IBaseComponentData {
  groupId: string
}

// 这里定义组件参数，自动合并到 IData 类型中
// properties 不能加类型，加了的话会导致下面获取不到正确的属性类型
const properties = {
  ok: Boolean,
  test: {
    type: Number,
  },
}

type IData = getComponentData<ICustomData, typeof properties>

/**
 * 描述你的组件
 *
 * @class ___ClassName___
 * @extends {SuperComponent<IData>}
 * @implements {Component.ComponentInstance<IData>}
 */
@wxComponent()
class ___ClassName___ extends SuperComponent<IData> implements Component.ComponentInstance<IData> {
  // public behaviors = []
  // public relations = {}

  public properties = properties

  public data = {
  } as IData

  constructor() {
    super()
  }

  /** DELETE: created attached ready detached 都要在第一行调用 super.xxx */

  public ready(): void {
    super.ready()
  }

}
