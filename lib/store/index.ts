import { configureStore } from "@reduxjs/toolkit"
import authReducer from "./slices/authSlice"
import menuReducer from "./slices/menuSlice"
import authorityReducer from "./slices/authoritySlice"
import userReducer from "./slices/userSlice"
import roomReducer from "./slices/roomSlice"
import conditionReducer from "./slices/conditionSlice"
import instrumentReducer from "./slices/instrumentSlice"
import titleMenuReducer from "./slices/titleMenuSlice"
import orderReducer from "./slices/orderSlice"
import orderTransferReducer from "./slices/orderTransferSlice"
import distributionReducer from "./slices/distributionSlice"
import sterilizationReducer from "./slices/sterilizationSlice"
import bmhpReducer from "./slices/bmhpSlice"
import notifReducer from "./slices/notifSlice"
import monitoringReducer from "./slices/monitoringSlice"
import icd10Reducer from "./slices/icd10Slice"
import categoriCPReducer from "./slices/categoriClinicalPathwaySlice"
import templateCPReducer from "./slices/templateClinicalPathwaySlice"
import asesmenCPReducer from "./slices/asesmenClinicalPathwaySlice"
import cleaningReducer from "./slices/cleaningSlice"

export const store = configureStore({
  reducer: {
    auth: authReducer,
    menus: menuReducer,
    authorities: authorityReducer,
    users: userReducer,
    rooms: roomReducer,
    conditions: conditionReducer,
    instruments: instrumentReducer,
    titleMenus: titleMenuReducer,
    orders: orderReducer,
    orderTransfers: orderTransferReducer,
    distributions: distributionReducer,
    sterilizations: sterilizationReducer,
    bmhps: bmhpReducer,
    notif: notifReducer,
    monitoring: monitoringReducer,
    cleaning: cleaningReducer,
    icd10: icd10Reducer,
    categoriCP: categoriCPReducer,
    templateCP: templateCPReducer,
    asesmenCP: asesmenCPReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
