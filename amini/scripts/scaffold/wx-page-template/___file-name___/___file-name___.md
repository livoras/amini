# ___title___

------

___describe___

页面地址：  
<!-- 参数：groupId、isAdd -->

------
## 当前页面的功能
<!-- 
商品展示情况

> * 根据上下架状态、搜索名称、分类显示商品列表
> * 单个商品显示内容
    > 图片、分类、名称、规格、供应价、建议团购价、总库存、剩余库存
> * 单个商品操作技能
> * 上架、下架
> * 编辑、删除
> 商品图片、名称、规格、供应价、建议团购价、库存、剩余库存、分类

选择、修改情况(新增一下内容)

> * 选择按钮
> * 确认选择按钮
> * 取消选择按钮 
-->
------

## 可以从哪里来

<!-- 供应商主页  
页面地址：pages/zone/home/home  
附带参数：groupId

新版开团接龙发布页  
页面地址： pages/manage_sequence/create_sequence/v2/publish-start-group/publish-start-group  
附带参数：groupId、isAdd

供应商的团购接龙【旧发布页】  
页面地址：pages/manage_sequence/create_sequence/index  
附带参数：groupId、isAdd -->


------

## 可以去哪里

<!-- 搜索页  
页面地址：pages/common/search

商品修改页【新增或者删除】 
页面地址：pages/supplier/product-editing/product-editing  
发送参数：groupId、isEditing（新增时没有）、productId（globaldata传入，没用）、isSale（没用）

分类管理页面  
页面地址：pages/manage_sequence/product-repository/category-manage/category-manage  
发送参数：groupId、isSupplier -->


------

## 使用的接口（可选）

<!-- | 作用    | 接口   |  参数  |
| -------- | -----  | ----   |
| 分类列表 | /seq/store_type_list |   groupId    |
| 商品列表 | /seq/storeroom_feature_list |   groupId、keyword、storeTypeId、status、featureType|
| 下架商品 | /supplier/sold_out_feature_storeroom |   id    |
| 上架商品 | /supplier/putaway_feature_storeroom |   id    | -->

------

## 相似的页面（可选）

<!-- 个人商品库  
页面地址：pages/manage_sequence/product-repository/product-repository

去开团的商品库  
页面地址：pages/manage_sequence/go-groupBuy-repository/go-groupBuy-repository   -->

------

## 注意事项（可选）

<!-- 该页面商品每次选择到创建页面均为同一个商品，商品实现库存统一 -->
