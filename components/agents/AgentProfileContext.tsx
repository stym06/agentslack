'use client'

import { createContext, useContext } from 'react'

type AgentProfileContextType = {
  openAgentProfile: (agentId: string) => void
  openAgentProfileByName: (name: string) => void
  closeAgentProfile: () => void
}

const AgentProfileContext = createContext<AgentProfileContextType>({
  openAgentProfile: () => {},
  openAgentProfileByName: () => {},
  closeAgentProfile: () => {},
})

export const AgentProfileProvider = AgentProfileContext.Provider

export function useAgentProfile() {
  return useContext(AgentProfileContext)
}
