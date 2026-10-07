const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'site' },
    siteName: { type: String, default: 'Brahmam Pandit' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    address: { type: String, default: '' },
    workingHours: { type: String, default: 'Mon - Sat, 9:00 AM - 7:00 PM' },
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    youtube: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    deliveryCharge: { type: Number, default: 50 },
    freeDeliveryAbove: { type: Number, default: 999 },
  },
  { timestamps: true }
);

const Setting = mongoose.model('Setting', settingSchema);
Setting.get = async () => (await Setting.findById('site')) || (await Setting.create({ _id: 'site' }));

module.exports = Setting;
