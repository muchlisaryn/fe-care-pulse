"use client"

import { Provider } from "react-redux"
import { store } from "./index"
import { setupAxiosInterceptors } from "@/lib/axios"
import { logout } from "./slices/authSlice"
import { clearAuth } from "@/lib/auth"

// Wire up axios interceptors once the store is available.
// Runs at module evaluation time so interceptors are ready before any API call.
setupAxiosInterceptors(
  () => store.getState().auth.token,
  () => {
    clearAuth()
    store.dispatch(logout())
  }
)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>
}
