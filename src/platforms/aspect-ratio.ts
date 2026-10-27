export const aspectRatio = (
  width: number | null | undefined,
  height: number | null | undefined,
) => (width && height ? width / height : undefined);
