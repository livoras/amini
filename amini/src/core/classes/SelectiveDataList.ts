import { Observable, throwError, observable } from "rxjs"
import { catchError, finalize, tap } from "rxjs/operators"
import { DataList3 } from "./DataList"

type FetchDataListObservableFunction<Item> = (lastId: number, showLoading: boolean) => Observable<Item[]>

export interface ISelectiveItem<T> {
  data: T
  isSelected: boolean
}
export interface ISelectiveInfo<T> {
  isSelectAll: boolean
  isSelectAllButton: boolean
  selectedItemList: Array<ISelectiveItem<T>>
  isHasSelectedTrueItem: boolean
  selectedTrueItemLength: number
}

export interface IPageInfo {
  /**
   * 拥有页数
   */
  allPage?: number
  endTime?: number
  isNext?: number
  /**
   * 是否有上一页
   */
  isPrev?: number
  listPages?: number[]
  orderBySql?: string
  orderDirection?: string
  orderField?: string
  /**
   * 当前页数
   */
  page?: number
  pagesize?: number
  startIndex?: number
  startTime?: number
  /**
   * 一共条数
   */
  totalCounts?: number
  useTime?: string
}
/**
 * 可全选的无限加载列表 继承DataList3 使用Observable 实现 dataList，
 *
 * @export SelectiveDataList
 * @class SelectiveDataList
 * @template I
 * @extends DataList3
 */
export class SelectiveDataList<I> {
  /** 全选按钮表现 */
  public isSelectAllButton: boolean = false
  /** true: 反全选, false: 正全选 */
  public isSelectAll: boolean = false
  /** 初始列表默认全选状态 */
  public isSelectAllDefault: boolean = false

  public selectiveList: Array<ISelectiveItem<I>> = []
  /** 反全选: 排除列表; 正全选: 选中列表  */
  public selectedItemList: Array<ISelectiveItem<I>> = []
  public listTotalCount?: number

  // 原dataList数据
  public listFetcher: DataList3<I>
  public dataList: I[] = []
  public loadList: I[] = []
  public isLoadingMoreDataList: boolean = false

  private idKey?: string
  private get totalCount(): number {
    if (this.listTotalCount === undefined) {
      throw new Error("请设置列表总长度")
    }
    return this.listTotalCount
  }

  private set totalCount(value: number) {
    this.listTotalCount = value
  }

  /**
   * SelectiveDataList构造函数 如需使用selectiveList相关方法 需要 在 selectiveFetchDataList方法中 加入this.setTotalCount()
   * @param {FetchDataListObservableFunction<I>} selectiveFetchDataList 获取数据的方法，返回一个Observable对象
   * @param {(
   * list: I[],
   * isLoadingMore: boolean,
   * loadList: I[],
   * selectiveList: ISelectiveItem[],
   * selectedInfo: ISelectiveInfo
   * ) => void} selectiveListChanged 数据变动后的回调方法
   * @param {number} selectivePageSize pageSize
   * @param {boolean} defaultSelected 是否默认全选 默认：不全选
   * @memberof SelectiveDataList
   */
  constructor(
    private selectiveFetcherDataList: FetchDataListObservableFunction<I>,
    public selectiveListChanged: (
      list: I[],
      isLoadingMore: boolean,
      loadList: I[],
      selectiveList: Array<ISelectiveItem<I>>,
      selectedInfo: ISelectiveInfo<I>,
    ) => void,
    public selectivePageSize: number = 10,
    public defaultSelected: boolean = false,
  ) {
    this.isSelectAllDefault = defaultSelected
    this.isSelectAll = defaultSelected
    this.isSelectAllButton = defaultSelected
    this.listFetcher = new DataList3(selectiveFetcherDataList,
      (list: I[], isLoadingMore: boolean, loadList: I[]): void => {
        this.dataList = list
        this.isLoadingMoreDataList = isLoadingMore
        this.loadList = loadList
        if (isLoadingMore) {
          this.selectiveList = this.selectiveList.concat(this.processSelectiveList(loadList))
        } else {
          this.selectiveList = this.processSelectiveList(list)
        }
        this.judgeSelectAllButtonState()
        this.listChange()
      }, selectivePageSize)
  }

  /** 设置总长度 */
  public setTotalCount(totalCount: number): void {
    this.totalCount = totalCount
  }

  /** 设置默认选中元素，设置idKey */
  public setDefaultSelectedItem(defaultIdList: Array<number | string>, idKey: string): void {
    this.idKey = idKey
    const selectItemList = defaultIdList.map((id) => {
      return {
        data: {
          [idKey]: id,
        },
        isSelected: !this.isSelectAll,
      }
    }) as any
    this.selectedItemList = selectItemList
  }

  /** 保存当前选中项 */
  public storeSelectedItemList(list: Array<ISelectiveItem<I>>, idKey: string): void {
    this.idKey = idKey
    this.selectedItemList = list
  }

  public reloadDataList(isShowLoading: boolean = true): void {
    this.isSelectAll = this.isSelectAllDefault
    this.listFetcher.reloadDataList(isShowLoading)
  }

  public loadMoreDataList(isShowLoading: boolean = true): void {
    this.listFetcher.loadMoreDataList(isShowLoading)
  }

  public refreshLatestPage(isShowLoading: boolean = true): void {
    this.listFetcher.refreshLastestPage(isShowLoading)
  }

  public refreshCurrentPage(index: number, isShowLoading: boolean = true): void {
    this.listFetcher.refreshCurrentPage(index, isShowLoading)
  }

  /**
   * 点击选中或取消选中单个元素传
   * 如需使用此功能请在 selectiveFetchDataList 中 调用this.setTotalCount()函数
   * @param {number} i 点击元素的i
   */
  public setSelectedItems(i: number): void {
    const selectedItem = this.selectiveList[i]
    selectedItem.isSelected = !selectedItem.isSelected
    if (this.idKey) {
      if (selectedItem.isSelected !== this.isSelectAll) {
        // 如果不一样就加
        this.selectedItemList.push((selectedItem))
      } else {
        // 如果一样就减
        this.selectedItemList = this.selectedItemList.filter((item) => {
          return item.data[this.idKey!] !== selectedItem.data[this.idKey!]
        })
      }
    } else {
      this.selectedItemList = this.selectiveList.filter((item) => item.isSelected !== this.isSelectAll)
    }
    this.judgeSelectAllButtonState()
    this.listChange()
  }

  /**
   * 点击选中或取消选中单个元素【不在当前列表中】
   * 如需使用此功能请在 传入idKey
   * @param {number} i 点击元素的i
   */
  public setSelectedItemByItem(selectedItem: ISelectiveItem<I>): void {
    const idKey = this.idKey
    if (!idKey) { return }
    const realIndex = this.selectiveList.findIndex((item) =>
      (item.data[idKey] === selectedItem.data[idKey]),
    )
    if (realIndex > -1) {
      this.setSelectedItems(realIndex)
    } else {
      const isAddItem = selectedItem.isSelected !== this.isSelectAll
      let goodsIdList = this.selectedItemList.map((item) => item.data[idKey])
      if (isAddItem) {
        goodsIdList.push(selectedItem.data[idKey])
      } else {
        goodsIdList = goodsIdList.filter((item) => item !== selectedItem.data[idKey])
      }
      this.setDefaultSelectedItem(goodsIdList, idKey)
      this.refreshList()
    }
  }

  public deleteItemById(id: number | string): void {
    this.selectedItemList = this.selectedItemList.filter((item) => {
      return item.data[this.idKey!] !== id
    })
  }

  public addItemById(id: number | string): void {
    const hasItem = this.selectedItemList.some((item) => item.data[this.idKey!] === id)
    if (!hasItem) {
      this.selectedItemList.push({
        isSelected: true,
        data: {
          [this.idKey!]: id,
        } as any,
      })
    }
  }

  // 重新刷新状态
  public refreshList(): void {
    this.selectiveList = this.processSelectiveList(this.dataList)
    this.judgeSelectAllButtonState()
    this.listChange()
  }

  /**
   * 点击全选
   * 如需使用此功能请在 selectiveFetchDataList 中 调用this.setTotalCount()函数
   * @param {boolean} selectAll 点击后的 布尔值
   */
  public setSelectedAll(selectAll: boolean): void {
    this.selectiveList.forEach((item) => {
      item.isSelected = selectAll
    })
    this.isSelectAll = selectAll
    this.selectedItemList = []
    this.judgeSelectAllButtonState()
    this.listChange()
  }

  // 判断全选的逻辑 & 全选按钮的逻辑
  public judgeSelectAllButtonState(): void {
    if (this.selectedItemList.length !== this.totalCount) {
      this.isSelectAllButton = !this.selectedItemList.length && this.isSelectAll
    } else {
      this.isSelectAll = !this.isSelectAll
      this.isSelectAllButton = this.isSelectAll
      this.selectedItemList = []
    }
    this.isSelectAll = this.selectiveList.length === 0 ? false : this.isSelectAll
    this.isSelectAllButton = this.selectiveList.length === 0 ? false : this.isSelectAllButton
  }

  private listChange(): void {
    const selectedInfo = {
      isSelectAll: this.isSelectAll,
      isSelectAllButton: this.isSelectAllButton,
      selectedItemList: this.selectedItemList,
      isHasSelectedTrueItem: this.isSelectAll || !!this.selectedItemList.length,
      selectedTrueItemLength: this.totalCount === undefined
      ? 0
      : this.isSelectAll
        ? this.totalCount - this.selectedItemList.length
        : this.selectedItemList.length,
    }
    this.selectiveListChanged(
      this.dataList,
      this.isLoadingMoreDataList,
      this.loadList,
      this.selectiveList,
      selectedInfo)
  }

  private processSelectiveList(list: I[]): Array<ISelectiveItem<I>> {
    return list.map((item) => {
      let isSelected = this.isSelectAll
      if (this.idKey) {
        const isNeedChange = this.selectedItemList.some((selectedItem) => {
          return selectedItem.data[this.idKey!] === item[this.idKey!]
        })
        isSelected = isNeedChange ? !this.isSelectAll : this.isSelectAll
      }
      return {
        data: item,
        isSelected,
      }
    })
  }
}
