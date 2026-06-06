export class WeatherJobQueue {
    private queueInstance: any;
    private initialized = false;

    constructor() {}

    // p-queue ships as ESM-only, so a dynamic import is needed at runtime
    // to avoid CommonJS interop issues with tsc.
    private async init(): Promise<void> {
        if (this.initialized) return;
        const { default: PQueue } = await import('p-queue');
        this.queueInstance = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 5 });
        this.initialized = true;
    }

    public async add<T>(task: () => Promise<T>): Promise<T> {
        await this.init();
        return this.queueInstance.add(task);
    }
}
