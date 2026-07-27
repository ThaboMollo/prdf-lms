import { PartialType } from '@nestjs/swagger';
import { CreateApplicationDto } from './create-application.dto';

/**
 * A draft is patched incrementally by wizard autosave — every field is
 * optional and only provided keys get written, mirroring
 * client-ui's updateDraftFull() (setIf pattern). Re-uses
 * CreateApplicationDto's field set and validation rules rather than
 * duplicating them.
 */
export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}
