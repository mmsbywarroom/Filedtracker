export type StartTrackingOptions = {
    apiBaseUrl: string;
    authToken: string;
    punchInAt: string;
};
export interface FieldBackgroundLocationPlugin {
    startTracking(options: StartTrackingOptions): Promise<{
        ok: boolean;
        needsSettings?: boolean;
        message?: string;
    }>;
    stopTracking(): Promise<{
        ok: boolean;
    }>;
    isTracking(): Promise<{
        active: boolean;
    }>;
    getLocationPermissionStatus(): Promise<{
        foreground: boolean;
        background: boolean;
        needsSettings: boolean;
    }>;
    requestLocationPermissions(): Promise<{
        foreground: boolean;
        background: boolean;
        needsSettings?: boolean;
    }>;
    openLocationSettings(): Promise<void>;
}
