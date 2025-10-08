import mongoose, { Schema } from "mongoose";

const SettingSchema = new Schema({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    name: { type: String, required: true },
    description: { type: String },
    group: { type: String, default: 'general' } // Para agrupar ajustes en el futuro
},{
    timestamps: true
});

const Setting = mongoose.model("setting", SettingSchema);
export default Setting;