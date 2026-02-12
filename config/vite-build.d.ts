export declare const minify: boolean;
/**
 * Shared build options to spread into Vite config.
 * Use: ...getSharedBuildConfig()
 */
export declare function getSharedBuildConfig(): {
    esbuild: {
        minify: boolean;
        drop: any[];
    };
    build: {
        minify: boolean;
        sourcemap: boolean;
        rollupOptions: {
            output: {
                compact: boolean;
            };
        };
    };
};
