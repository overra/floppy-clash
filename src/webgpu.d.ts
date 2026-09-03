interface GPUAdapter {
  requestDevice(desc?: unknown): Promise<GPUDevice>;
}
interface GPUDevice {
  addEventListener?(type: 'uncapturederror', cb: (ev: unknown) => void): void;
  features: ReadonlySet<string>;
  createShaderModule(desc: { code: string }): GPUShaderModule;
  createRenderPipeline(desc: unknown): GPURenderPipeline;
  createBuffer(desc: { size: number; usage: number }): GPUBuffer;
  createBindGroup(desc: unknown): GPUBindGroup;
  createSampler(desc?: unknown): GPUSampler;
  createTexture(desc: unknown): GPUTexture;
  createQuerySet(desc: { type: 'timestamp' | 'occlusion'; count: number }): GPUQuerySet;
  createCommandEncoder(): GPUCommandEncoder;
  queue: {
    writeBuffer(buf: GPUBuffer, off: number, data: BufferSource, dataOffset?: number, size?: number): void;
    writeTexture(dest: unknown, data: BufferSource | Uint8ClampedArray, layout: unknown, size: unknown): void;
    submit(c: unknown[]): void;
  };
}
interface GPUShaderModule {
  getCompilationInfo?(): Promise<{ messages: { type: string; lineNum: number; linePos: number; message: string }[] }>;
}
interface GPURenderPipeline {
  getBindGroupLayout(i: number): unknown;
}
interface GPUBuffer {
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}
interface GPUQuerySet {
  destroy(): void;
}
interface GPUBindGroup {
  dummy?: true;
}
interface GPUSampler {
  dummy?: true;
}
interface GPUTexture {
  destroy(): void;
  createView(): unknown;
}
interface GPUCommandEncoder {
  beginRenderPass(desc: unknown): GPURenderPass;
  resolveQuerySet(querySet: GPUQuerySet, firstQuery: number, queryCount: number, destination: GPUBuffer, destinationOffset: number): void;
  copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, size: number): void;
  finish(): unknown;
}
interface GPURenderPass {
  setPipeline(p: GPURenderPipeline): void;
  setBindGroup(i: number, g: GPUBindGroup): void;
  draw(v: number, i?: number, firstVertex?: number, firstInstance?: number): void;
  end(): void;
}
interface GPUCanvasContext {
  configure(desc: unknown): void;
  getCurrentTexture(): { createView(): unknown };
  canvas?: HTMLCanvasElement;
}
type GPUTextureFormat = string;
interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}
interface Navigator {
  gpu?: GPU;
}
interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}
declare const GPUBufferUsage: {
  UNIFORM: number;
  COPY_DST: number;
  COPY_SRC: number;
  STORAGE: number;
  MAP_READ: number;
  QUERY_RESOLVE: number;
};
declare const GPUMapMode: {
  READ: number;
  WRITE: number;
};
declare const GPUTextureUsage: {
  TEXTURE_BINDING: number;
  COPY_DST: number;
  RENDER_ATTACHMENT: number;
};
type GPUColorDict = { r: number; g: number; b: number; a: number };
