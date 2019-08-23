var metaMap = new Map();
Reflect.metadata = function (metaKey, metaValue) {
    return function (target, propKey) {
        var metas = metaMap.get(target) || new Map();
        metas.set(metaKey, metaValue);
        metaMap.set(target, metas);
    };
};
Reflect.getMetadata = function (metaName, target) {
    var metas = metaMap.get(target);
    if (!metas) {
        return;
    }
    return metas.get(metaName);
};
