import { afterEach, describe, expect, it } from "vitest";
import {
  moduleRegistry,
  registerRendererModule,
  type RendererModule,
} from "../registry";

const TEST_MODULE_ID = "registry-test-module";

function createModule(displayName: string): RendererModule {
  return {
    id: TEST_MODULE_ID,
    displayName,
    widget: () => null,
  };
}

afterEach(() => {
  const index = moduleRegistry.findIndex(
    (module) => module.id === TEST_MODULE_ID,
  );
  if (index !== -1) {
    moduleRegistry.splice(index, 1);
  }
});

describe("renderer module registry", () => {
  it("keeps repeated registration of the same module id to one entry", () => {
    registerRendererModule(createModule("First name"));
    registerRendererModule(createModule("Updated name"));

    expect(
      moduleRegistry.filter((module) => module.id === TEST_MODULE_ID),
    ).toHaveLength(1);
    expect(
      moduleRegistry.find((module) => module.id === TEST_MODULE_ID)
        ?.displayName,
    ).toBe("Updated name");
  });
});
