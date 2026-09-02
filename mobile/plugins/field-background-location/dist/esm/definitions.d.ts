export type StartTrackingOptions = {
    apiBaseUrl: string;
    authToken: string;
    punchInAt: string;
};
export interface FieldBackgroundLocationPlugin {
    startTracking(options: StartTrackingOptions): Promise<{
        ok: boolean;
    }>;
    stopTracking(): Promise<{
        ok: boolean;
    }>;
    isTracking(): Promise<{
        active: boolean;
    }>;
}
