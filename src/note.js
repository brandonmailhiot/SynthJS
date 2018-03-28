const Frequency = require('./frequency');
const Duration = require('./duration');

module.exports = (note) => {
	const firstParam = note[0];
    const secondParam = note[1];
	const fx = note[2] || [];
	if (firstParam[0] === '@') fx.push(firstParam)

	let noteSchema = {};

	switch(fx[0]) {
		case 'slide':
			noteSchema = {
				fx,
				firstParam,
				secondParam,
				outputDuration: Duration[firstParam],
				outputFrequency: [Frequency[secondParam]],
			};
			break;

		case 'poly':
			noteSchema = {
				fx,
				firstParam,
				secondParam,
				outputDuration: Duration[firstParam],
				outputFrequency: secondParam.split(' ').map(f => Frequency[f]),
			};
			break;

		case '@gain':
			noteSchema = {
				fx,
				value: secondParam,
			};
			break;

		case '@instrument':
			noteSchema = {
				fx,
				value: secondParam,
			};
			break;

		case '@detune':
			noteSchema = {
				fx,
				value: secondParam,
			};
			break;
		
		case '@reverb':
			noteSchema = {
				fx,
				value: secondParam,
			};
			break;

		default:
			noteSchema = {
				fx,
				firstParam,
				secondParam,
				outputDuration: Duration[firstParam],
				outputFrequency: [Frequency[secondParam]],
			};
			break;
	}
	
	return noteSchema
}