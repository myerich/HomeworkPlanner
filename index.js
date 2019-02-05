const Alexa = require('ask-sdk');
const DateParser = require('amazon-date-parser');
const { DynamoDbPersistenceAdapter } = require('ask-sdk-dynamodb-persistence-adapter');

const config = {
    tableName: process.env.DYNAMODB_TABLE,
    partitionKeyName: 'userId'
}
const PersistenceAdapter = new DynamoDbPersistenceAdapter(config);

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        console.log()
        const speechText = 'Hello! Tell me you have a new assignment or course to add or ask me about your classes or homework';
        const repromptText = 'For more help, say help me'

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(repromptText)
            .getResponse();
    }
};

const AddHomeworkIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AddHomeworkIntent';
    },
    handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        const date = new DateParser(slots.Date.value).startDate;
        const dateString = date.getMonth() + '/' + date.getDate();

        const params = {
            persistentAttributes: {
                userId: handlerInput.requestEnvelope.session.user.userId,
                dueDate: dateString
            }
        };

        handlerInput.attributesManager.setPersistentAttributes(params);
        handlerInput.attributesManager.savePersistentAttributes();

        speechText = 'New assignment added on <say-as interpret-as="date" format="md">' + dateString + '</say-as>';

        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'HelpIntent';
    },
    handle(handlerInput) {
        const speechText = 'Tell me you have a new assignment or course to add or ask me about your classes or homework';

        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};

const ExitIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && (handlerInput.requestEnvelope.request.intent.name === 'StopIntent'
                || handlerInput.requestEnvelope.request.intent.name === 'CancelIntent');
    },
    handle(handlerInput) {
        const speechText = 'Good bye!';

        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        //any cleanup logic goes here
        return handlerInput.responseBuilder
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`Error handled: ${error.stack}`);

        const errorText = 'Sorry, I can\'t understand the command. Please say again.';

        return handlerInput.responseBuilder
            .speak(errorText)
            .reprompt(errorText)
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        AddHomeworkIntentHandler,
        HelpIntentHandler,
        ExitIntentHandler,
        SessionEndedRequestHandler)
    .addErrorHandlers(ErrorHandler)
    .withPersistenceAdapter(PersistenceAdapter)
    .lambda();
