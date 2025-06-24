/**
 * 序列化单个Sequelize模型实例
 * @param {Object} model - Sequelize模型实例
 * @returns {Object} 序列化后的普通JavaScript对象
 */
exports.serializeModel = (model) => {
    if (!model) return null;
    return model.toJSON ? model.toJSON() : model;
};

/**
 * 序列化Sequelize模型实例数组
 * @param {Array} models - Sequelize模型实例数组
 * @returns {Array} 序列化后的普通JavaScript对象数组
 */
exports.serializeModels = (models) => {
    if (!Array.isArray(models)) return [];
    return models.map(model => exports.serializeModel(model));
}; 