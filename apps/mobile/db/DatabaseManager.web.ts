/**
 * DatabaseManager - Web Stub
 * 
 * Web platform doesn't use SQLite, so this is a stub that prevents
 * expo-sqlite imports from being included in the web bundle.
 */

export class DatabaseManager {
  private static instance: DatabaseManager;
  
  private constructor() {
    console.log('🌐 DatabaseManager (web stub) - SQLite not used on web');
  }
  
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }
  
  // Stub methods that do nothing on web
  public async initialize(...args: any[]): Promise<void> {
    console.log('🌐 DatabaseManager.initialize() - Skipped on web (using IndexedDB instead)');
  }
  
  public async loadInitialResourcesFromJSON(...args: any[]): Promise<void> {
    console.log('🌐 DatabaseManager.loadInitialResourcesFromJSON() - Skipped on web');
  }
  
  public async resetAndReloadResources(...args: any[]): Promise<void> {
    console.log('🌐 DatabaseManager.resetAndReloadResources() - Not available on web');
  }
  
  public getDb(): any {
    console.warn('🌐 DatabaseManager.getDb() - Not available on web, use storage adapters');
    return null;
  }
  
  public getSqliteDb(): any {
    console.warn('🌐 DatabaseManager.getSqliteDb() - Not available on web, use storage adapters');
    return null;
  }
  
  // Add other methods as stubs if needed
  public static setForceReextract(force: boolean): void {
    // No-op on web
  }
  
  public static getForceReextract(): boolean {
    return false;
  }
}



