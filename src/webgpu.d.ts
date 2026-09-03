interface GPUAdapter {
  requestDevice(desc?: unknown): Promise<GPUDevice>;
}
interface GPUDevice {
  createShaderModule(desc: { code: string }): GPUShaderModule;
  createRenderPipeline(desc: unknown): GPURenderPipeline;
  createBuffer(desc: { size: number; usage: number }): GPUBuffer;
  createBindGroup(desc: unknown): GPUBindGroup;
  createQuerySet?: (desc: unknown) => unknown;
  createCommandEncoder(): GPUCommandEncoder;
  queue: { writeBuffer(buf: GPUBuffer, off: number, data: BufferSource): void; submit(c: unknown[]): void };
}
interface GPUShaderModule {
  dummy?: true;
}
interface GPURenderPipeline {
  getBindGroupLayout(i: number): unknown;
}
interface GPUBuffer {
  dummy?: true;
}
interface GPUBindGroup {
  dummy?: true;
}
interface GPUCommandEncoder {
  beginRenderPass(desc: unknown): GPURenderPass;
  finish(): unknown;
}
interface GPURenderPass {
  setPipeline(p: GPURenderPipeline): void;
  setBindGroup(i: number, g: GPUBindGroup): void;
  draw(v: number, i?: number): void;
  end(): void;
}
interface GPUCanvasContext {
  configure(desc: unknown): void;
  getCurrentTexture(): { createView(): unknown };
}
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
  STORAGE: number;
};
type GPUColorDict = { r: number; g: number; b: number; a: number };
