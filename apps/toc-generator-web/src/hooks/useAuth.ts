import { useState, useEffect } from 'react'

interface AuthState {
  token: string | null
  server: string | null
  isAuthenticated: boolean
}

const STORAGE_KEY_TOKEN = 'toc_generator_token'
const STORAGE_KEY_SERVER = 'toc_generator_server'

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    token: null,
    server: null,
    isAuthenticated: false,
  })

  // Load from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN)
    const savedServer = localStorage.getItem(STORAGE_KEY_SERVER)
    
    if (savedToken && savedServer) {
      setAuth({
        token: savedToken,
        server: savedServer,
        isAuthenticated: true,
      })
    }
  }, [])

  const login = (token: string, server: string) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, token)
    localStorage.setItem(STORAGE_KEY_SERVER, server)
    setAuth({
      token,
      server,
      isAuthenticated: true,
    })
  }

  const logout = () => {
    // Clear all authentication data from localStorage
    localStorage.removeItem(STORAGE_KEY_TOKEN)
    localStorage.removeItem(STORAGE_KEY_SERVER)
    
    // Reset auth state
    setAuth({
      token: null,
      server: null,
      isAuthenticated: false,
    })
  }

  return {
    ...auth,
    login,
    logout,
  }
}
