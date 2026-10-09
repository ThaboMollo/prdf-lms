import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { countWords, stripPurposeCategory } from './generated-constraints';

/**
 * Require at least `min` words, counted the same way the browser counts them.
 *
 * class-validator has no word rule — `@Length` counts characters, which is what
 * `purpose` used to be bounded by (30 characters). PRDF's reviewer asked for a
 * 50-word minimum instead, and 50 words cannot be expressed as a character
 * count: "no no no no no…" clears 150 characters without describing anything.
 *
 * `countWords` comes from the generated mirror of packages/domain/constraints.ts
 * so the server and the wizard's live counter cannot disagree about what a word
 * is. `stripCategoryPrefix` matters because the API receives purpose as
 * "<category>: <free text>" — see stripPurposeCategory's note.
 */
export function MinWords(
  min: number,
  options?: ValidationOptions & { stripCategoryPrefix?: boolean },
): PropertyDecorator {
  const strip = options?.stripCategoryPrefix ?? false;

  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'minWords',
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [min],
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return countWords(strip ? stripPurposeCategory(value) : value) >= min;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be at least ${min} words.`;
        },
      },
    });
  };
}
