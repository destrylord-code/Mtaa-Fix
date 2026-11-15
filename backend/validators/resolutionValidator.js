import { z } from 'zod';

export const createResolutionSubmissionSchema = z.object({
  reportId: z.string().trim().min(1, 'Report ID is required'),
  status: z.enum(['PENDING']).default('PENDING'),
  notes: z.string().trim().min(5).max(2000),
  mediaUrls: z.array(z.string()).optional(),
});

export const updateResolutionSubmissionSchema = z.object({
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'PARTIAL']).optional(),
  notes: z.string().trim().max(2000).optional(),
  mediaUrls: z.array(z.string().url()).optional(),
});

export const rejectResolutionSubmissionSchema = z.object({ reason: z.string().trim().min(5).max(2000) });
export default { createResolutionSubmissionSchema, updateResolutionSubmissionSchema, rejectResolutionSubmissionSchema };
