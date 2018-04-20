const Frequency = require('./frequency');
const Duration = require('./duration');

module.exports = (note) => {
	const inputDuration = note[0];
    const inputFrequency = note[1];
	const effect = note[2] || [];
	if (inputDuration[0] === '@') effect.push(inputDuration)

	let noteSchema = {};

	switch(effect[0]) {
		case 'slide':
			noteSchema = {
				effect,
				inputDuration,
				inputFrequency,
				outputDuration: Duration[inputDuration],
				outputFrequency: [Frequency[inputFrequency]],
			};
			break;

		case 'poly':
			noteSchema = {
				effect,
				inputDuration,
				inputFrequency,
				outputDuration: Duration[inputDuration],
				outputFrequency: inputFrequency.split(' ').map(f => Frequency[f]),
			};
			break;

		case '@gain':
			noteSchema = {
				effect,
				value: inputFrequency,
			};
			break;

		case '@instrument':
			noteSchema = {
				effect,
				value: inputFrequency,
			};
			break;

		case '@detune':
			noteSchema = {
				effect,
				value: inputFrequency,
			};
			break;
		
		case '@reverb':
			noteSchema = {
				effect,
				value: inputFrequency,
			};
			break;

		case '@distortion':
			noteSchema = {
				effect,
				value: inputFrequency,
			};
			break;

		default:
			noteSchema = {
				effect,
				inputDuration,
				inputFrequency,
				outputDuration: Duration[inputDuration],
				outputFrequency: [Frequency[inputFrequency]],
			};
			break;
	}
	
	return noteSchema
}