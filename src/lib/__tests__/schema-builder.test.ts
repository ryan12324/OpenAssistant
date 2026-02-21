import { describe, it, expect } from "vitest";
import { z } from "zod";
import { buildZodSchemaFromParams, buildZodSchemaFromJsonSchema } from "@/lib/schema-builder";

describe("schema-builder", () => {
  describe("buildZodSchemaFromParams", () => {
    it("returns an empty shape for an empty params array", () => {
      const shape = buildZodSchemaFromParams([]);
      expect(Object.keys(shape)).toHaveLength(0);
    });

    it("creates a required string schema for type 'string'", () => {
      const shape = buildZodSchemaFromParams([
        { name: "text", type: "string", description: "A text field", required: true },
      ]);
      expect(shape).toHaveProperty("text");
      const schema = z.object(shape);
      expect(schema.parse({ text: "hello" })).toEqual({ text: "hello" });
      expect(() => schema.parse({})).toThrow();
    });

    it("creates an optional string schema when required is false", () => {
      const shape = buildZodSchemaFromParams([
        { name: "text", type: "string", description: "Optional text", required: false },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({})).toEqual({});
      expect(schema.parse({ text: "hello" })).toEqual({ text: "hello" });
    });

    it("creates an optional string schema when required is undefined", () => {
      const shape = buildZodSchemaFromParams([
        { name: "text", type: "string", description: "No required field" },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({})).toEqual({});
    });

    it("creates a number schema for type 'number'", () => {
      const shape = buildZodSchemaFromParams([
        { name: "count", type: "number", description: "A count", required: true },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({ count: 42 })).toEqual({ count: 42 });
      expect(() => schema.parse({ count: "not a number" })).toThrow();
    });

    it("creates a number schema for type 'integer'", () => {
      const shape = buildZodSchemaFromParams([
        { name: "count", type: "integer", description: "An integer", required: true },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({ count: 5 })).toEqual({ count: 5 });
    });

    it("creates a boolean schema for type 'boolean'", () => {
      const shape = buildZodSchemaFromParams([
        { name: "flag", type: "boolean", description: "A flag", required: true },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({ flag: true })).toEqual({ flag: true });
      expect(() => schema.parse({ flag: "true" })).toThrow();
    });

    it("creates an array schema for type 'array'", () => {
      const shape = buildZodSchemaFromParams([
        { name: "items", type: "array", description: "A list", required: true },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({ items: [1, "two", true] })).toEqual({ items: [1, "two", true] });
      expect(() => schema.parse({ items: "not array" })).toThrow();
    });

    it("creates an object (record) schema for type 'object'", () => {
      const shape = buildZodSchemaFromParams([
        { name: "data", type: "object", description: "Some data", required: true },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({ data: { key: "value" } })).toEqual({ data: { key: "value" } });
    });

    it("defaults to string schema for unknown types", () => {
      const shape = buildZodSchemaFromParams([
        { name: "custom", type: "custom-type", description: "Custom", required: true },
      ]);
      const schema = z.object(shape);
      expect(schema.parse({ custom: "text" })).toEqual({ custom: "text" });
      expect(() => schema.parse({ custom: 123 })).toThrow();
    });

    it("handles multiple parameters of different types", () => {
      const shape = buildZodSchemaFromParams([
        { name: "name", type: "string", description: "Name", required: true },
        { name: "age", type: "number", description: "Age", required: true },
        { name: "active", type: "boolean", description: "Active", required: false },
        { name: "tags", type: "array", description: "Tags", required: false },
        { name: "meta", type: "object", description: "Metadata", required: false },
      ]);
      const schema = z.object(shape);
      const result = schema.parse({ name: "Alice", age: 30 });
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("preserves descriptions on schemas", () => {
      const shape = buildZodSchemaFromParams([
        { name: "text", type: "string", description: "My description", required: true },
      ]);
      expect(shape.text.description).toBe("My description");
    });
  });

  describe("buildZodSchemaFromJsonSchema", () => {
    it("returns an empty shape for empty properties", () => {
      const shape = buildZodSchemaFromJsonSchema({});
      expect(Object.keys(shape)).toHaveLength(0);
    });

    it("creates a required string schema for a required property", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { text: { type: "string", description: "A text field" } },
        ["text"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ text: "hello" })).toEqual({ text: "hello" });
      expect(() => schema.parse({})).toThrow();
    });

    it("creates an optional string schema for a non-required property", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { text: { type: "string", description: "Optional text" } },
        []
      );
      const schema = z.object(shape);
      expect(schema.parse({})).toEqual({});
    });

    it("creates an optional schema when required array is undefined", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { text: { type: "string" } },
        undefined
      );
      const schema = z.object(shape);
      expect(schema.parse({})).toEqual({});
    });

    it("creates a number schema for type 'number'", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { count: { type: "number" } },
        ["count"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ count: 42 })).toEqual({ count: 42 });
    });

    it("creates a number schema for type 'integer'", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { num: { type: "integer", description: "An integer" } },
        ["num"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ num: 7 })).toEqual({ num: 7 });
    });

    it("creates a boolean schema for type 'boolean'", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { flag: { type: "boolean", description: "A flag" } },
        ["flag"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ flag: false })).toEqual({ flag: false });
    });

    it("creates an array schema for type 'array'", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { items: { type: "array", description: "Items" } },
        ["items"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ items: [1, 2] })).toEqual({ items: [1, 2] });
    });

    it("creates an object (record) schema for type 'object'", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { data: { type: "object", description: "Data" } },
        ["data"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ data: { a: 1 } })).toEqual({ data: { a: 1 } });
    });

    it("defaults to string schema for unknown types", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { custom: { type: "unknown", description: "Custom" } },
        ["custom"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ custom: "text" })).toEqual({ custom: "text" });
      expect(() => schema.parse({ custom: 123 })).toThrow();
    });

    it("handles properties without a description", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { nodesc: { type: "string" } },
        ["nodesc"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ nodesc: "value" })).toEqual({ nodesc: "value" });
      // No description should be set
      expect(shape.nodesc.description).toBeUndefined();
    });

    it("sets description when provided", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { withDesc: { type: "string", description: "Has description" } },
        ["withDesc"]
      );
      expect(shape.withDesc.description).toBe("Has description");
    });

    it("handles multiple properties with mixed required/optional", () => {
      const shape = buildZodSchemaFromJsonSchema(
        {
          name: { type: "string", description: "Name" },
          age: { type: "number", description: "Age" },
          active: { type: "boolean", description: "Active" },
        },
        ["name", "age"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ name: "Bob", age: 25 })).toEqual({ name: "Bob", age: 25 });
      expect(schema.parse({ name: "Bob", age: 25, active: true })).toEqual({
        name: "Bob",
        age: 25,
        active: true,
      });
    });

    it("handles properties with undefined type (defaults to string)", () => {
      const shape = buildZodSchemaFromJsonSchema(
        { notype: { description: "No type specified" } },
        ["notype"]
      );
      const schema = z.object(shape);
      expect(schema.parse({ notype: "text" })).toEqual({ notype: "text" });
    });
  });
});
