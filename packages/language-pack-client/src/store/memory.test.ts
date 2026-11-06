import { storeContract } from './contract'
import { memoryStore } from './memory'

storeContract(async () => memoryStore())
