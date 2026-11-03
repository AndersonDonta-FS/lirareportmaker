import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  filename: z.string().max(200),
  // data:application/pdf;base64,....
  dataUrl: z
    .string()
    .startsWith("data:application/pdf;base64,")
    .max(25_000_000),
});

export type LabSample = { id: string; location: string; surface: string; result: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["samples"],
  properties: {
    samples: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "location", "surface", "result"],
        properties: {
          id: { type: "string", description: "Client sample ID number, e.g. '1'" },
          location: { type: "string", description: "Room/location, e.g. 'Foyer Floor'" },
          surface: {
            type: "string",
            description: "Floor/sill surface material (Tile, Carpet, Wood, Concrete...) if written anywhere, else ''",
          },
          result: {
            type: "string",
            description: "Lead result in µg/ft² exactly as reported, without units, e.g. '<2' or '2.9'",
          },
        },
      },
    },
  },
} as const;

export const extractLabResults = createServerFn({ method: "POST" })
  .validator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<{ samples: LabSample[]; error?: string }> => {
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions:
          "You read EPA lead dust-wipe laboratory reports (e.g. EMSL). Extract every client dust wipe sample with its lead result. " +
          "Use the Client Sample ID number as id and the description after the slash as location (e.g. '1/Foyer Floor' → id '1', location 'Foyer Floor'). " +
          "Report results like '<2.0 µg/ft²' as '<2' and numeric results like '2.9 µg/ft²' as '2.9'. " +
          "If the chain-of-custody pages list the surface (tile, carpet, wood, concrete, vinyl), include it; otherwise leave surface empty. Skip blanks/QC samples.",
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", filename: data.filename || "lab.pdf", file_data: data.dataUrl },
              { type: "input_text", text: "Extract the dust wipe samples from this lab report as JSON." },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "lab_results", schema: SCHEMA, strict: true } },
      });
      let text = "";
      for (const item of res.output ?? []) {
        if (item.type === "message") {
          for (const c of item.content) if (c.type === "output_text") text += c.text;
        }
      }
      const parsed = JSON.parse(text || "{}") as { samples?: LabSample[] };
      return { samples: parsed.samples ?? [] };
    } catch (e) {
      console.error("lab extraction failed", e);
      if (e instanceof GatewayError) {
        if (e.httpStatus === 402) return { samples: [], error: "AI credits are used up. Add credits or type the results in." };
        if (e.httpStatus === 429) return { samples: [], error: "Too many requests right now. Wait a minute and try again." };
      }
      return { samples: [], error: "Couldn't read the lab report. You can type the results in below." };
    }
  });
