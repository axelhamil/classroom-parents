import { describe, expect, it } from "vitest";
import { childAvatarSrc } from "../child-avatar-src";

const PHOTO = "https://lh3.googleusercontent.com/a/jade";

describe("childAvatarSrc", () => {
  it("given a Google photo the parent did not pick, then the child is drawn by its initial on its color", () => {
    expect(childAvatarSrc({ avatarUrl: PHOTO, showsPhoto: false })).toBeNull();
  });

  it("given the photo picked by the parent, then the child is drawn with it", () => {
    expect(childAvatarSrc({ avatarUrl: PHOTO, showsPhoto: true })).toBe(PHOTO);
  });

  it("given the photo picked but gone from Google, then the child falls back to its initial", () => {
    expect(childAvatarSrc({ avatarUrl: null, showsPhoto: true })).toBeNull();
  });
});
