declare module "*.webp" {
  const content: import("next/image").StaticImageData;
  export default content;
}
