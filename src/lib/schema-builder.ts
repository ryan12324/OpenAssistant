import { z } from "zod";

interface ParameterDef {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

/**
 * Converts an array of parameter definitions into a Zod object shape.
 */
export function buildZodSchemaFromParams(
  params: ParameterDef[]
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const param of params) {
    let schema: z.ZodTypeAny;
    switch (param.type) {
      case "number":
      case "integer":
        schema = z.number().describe(param.description);
        break;
      case "boolean":
        schema = z.boolean().describe(param.description);
        break;
      case "array":
        schema = z.array(z.unknown()).describe(param.description);
        break;
      case "object":
        schema = z.record(z.unknown()).describe(param.description);
        break;
      default:
        schema = z.string().describe(param.description);
    }
    shape[param.name] = param.required ? schema : schema.optional();
  }
  return shape;
}

/**
 * Converts JSON Schema properties into a Zod object shape.
 */
export function buildZodSchemaFromJsonSchema(
  properties: Record<string, { type?: string; description?: string }>,
  required?: string[]
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const requiredSet = new Set(required ?? []);
  for (const [propName, propDef] of Object.entries(properties)) {
    let schema: z.ZodTypeAny;
    switch (propDef.type) {
      case "number":
      case "integer":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "array":
        schema = z.array(z.unknown());
        break;
      case "object":
        schema = z.record(z.unknown());
        break;
      default:
        schema = z.string();
    }
    if (propDef.description) schema = schema.describe(propDef.description);
    shape[propName] = requiredSet.has(propName) ? schema : schema.optional();
  }
  return shape;
}
