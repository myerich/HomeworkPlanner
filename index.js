const Alexa = require('ask-sdk');
const DateParser = require('amazon-date-parser');
const Moment = require('moment-timezone');

const { DynamoDbPersistenceAdapter } = require('ask-sdk-dynamodb-persistence-adapter');

const config = {
    tableName: process.env.DYNAMODB_TABLE,
    partitionKeyName: 'userId'
};
const PersistenceAdapter = new DynamoDbPersistenceAdapter(config);

const SetUpIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'SetUpIntent'
    },
    handle(handlerInput) {
        if (handlerInput.requestEnvelope.request.intent.dialogState != "COMPLETE") {
            console.log('More info required for set up');
            return handlerInput.responseBuilder
                .addDelegateDirective()
                .getResponse();
        }
        console.log('Set up complete, initializing courses');
        const attributesManager = handlerInput.attributesManager;
        let sessionAttributes = attributesManager.getSessionAttributes();

        const slots = handlerInput.requestEnvelope.request.intent.slots;
        sessionAttributes.data.profile.name = slots.name.value;
        attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .addDelegateDirective(buildIntent('AddCourseIntent'))
            .speak('Now lets add some courses to your schedule')
            .getResponse();
    }
}

const RequireSetUpHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        return (handlerInput.requestEnvelope.request.type === 'LaunchRequest' ||
            handlerInput.requestEnvelope.request.type === 'IntentRequest') &&
            sessionAttributes.isNew;
    },
    handle(handlerInput) {
        console.log('Prompting new user set up');
        const isLaunchRequest = handlerInput.requestEnvelope.request.type === 'LaunchRequest';
        if (!isLaunchRequest) {
            console.log('Saving intent request context for post setup recall');
            const attributesManager = handlerInput.attributesManager;
            let sessionAttributes = attributesManager.getSessionAttributes();
            sessionAttributes.prevContext = handlerInput.requestEnvelope.request.intent;
            attributesManager.setSessionAttributes(sessionAttributes);
        }
        const speechText = getNewUserSetUpSpeech(isLaunchRequest);
        return handlerInput.responseBuilder
            .addDelegateDirective(buildIntent('SetUpIntent'))
            .speak(speechText)
            .getResponse();
    }
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes();

        const [speechText, repromptText] = getWelcomeSpeech(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(repromptText)
            .getResponse();
    }
};

const AddCourseIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AddCourseIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .getResponse();
    }
};

const AddHomeworkIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AddHomeworkIntent';
    },
    handle(handlerInput) {
        const intent = handlerInput.requestEnvelope.request.intent;
        if (intent.slots.assignment.value && intent.slots.date.value && intent.slots.course.value) {
            console.log('Adding new homework assignment');
            const attributesManager = handlerInput.attributesManager;
            let sessionAttributes = attributesManager.getSessionAttributes();

            const assignment = buildAssignment(intent.slots);
            sessionAttributes.data.assignments.push(assignment);
            attributesManager.setSessionAttributes(sessionAttributes);

            const speechText = confirmAssignmentSpeech(assignment);
            return handlerInput.responseBuilder
                .speak(speechText)
                .getResponse();
        } else {
            console.log('Missing information to add homework, delegating dialogue');
            return handlerInput.responseBuilder
                .addDelegateDirective(intent)
                .getResponse();
        }
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
        console.log('Session ended');
        return handlerInput.responseBuilder
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`Error handled: ${error.message}`);
        console.log(error.stack);

        const errorText = "Sorry, I can\'t understand the command. Please say again.";

        return handlerInput.responseBuilder
            .speak(errorText)
            .reprompt(errorText)
            .getResponse();
    }
};

const NewSessionRequestInterceptor = {
    async process(handlerInput) {
        console.log('request:', JSON.stringify(handlerInput.requestEnvelope.request));

        if (handlerInput.requestEnvelope.session.new) {
            const attributesManager = handlerInput.attributesManager;

            let sessionAttributes =  attributesManager.getSessionAttributes();
            const persistentAttributes = await attributesManager.getPersistentAttributes();

            console.log('session:', sessionAttributes);
            console.log('persistent:', persistentAttributes);

            if (!persistentAttributes.preferences) {
                console.log('Initializing user preferences');
                sessionAttributes.data = initializeUserData();

            } else {
                console.log('Loading preferences in session attributes');
                sessionAttributes.data= persistentAttributes;
            }

            if (!sessionAttributes.data.profile.name) {
                sessionAttributes.isNew = true;
            }

            attributesManager.setSessionAttributes(sessionAttributes);
        }
    }
};

const SetTimezoneInterceptor = {
    async process(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        let sessionAttributes = attributesManager.getSessionAttributes();

        if (!sessionAttributes.data.profile.timezone) {
            const serviceClientFactory = handlerInput.serviceClientFactory;
            const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;

            const upsServiceClient = serviceClientFactory.getUpsServiceClient();
            let timezone = await upsServiceClient.getSystemTimeZone(deviceId);

            console.log('New timezone set: ', timezone);
            sessionAttributes.data.profile.timezone = timezone;
            attributesManager.setSessionAttributes(sessionAttributes);
        }
    }
};

const ConvertDateInterceptor = {
    process(handlerInput) {
        if (handlerInput.requestEnvelope.request.type === 'IntentRequest') {
            slots = handlerInput.requestEnvelope.request.intent.slots;
            if (slots.date && slots.date.value) {
                const date = DateParser(slots.date.value).startDate;
                slots.date.value = {
                    dayOfWeek: date.getDay(),
                    day: date.getDate(),
                    month: date.getMonth(),
                    year: date.getFullYear()
                };
                console.log('Date converted: ', slots.date.value);
            }
        }
    }
};

const SessionEndingResponseInterceptor = {
    async process(handlerInput, responseOutput) {
        console.log('reponse: ', JSON.stringify(responseOutput));
        if (responseOutput.shouldEndSession && !responseOutput.directives
                || handlerInput.requestEnvelope.request.type === 'SessionEndedRequest') {

            const attributesManager = handlerInput.attributesManager;
            let sessionAttributes = attributesManager.getSessionAttributes();

            console.log('Saving persistent attributes: ', JSON.stringify(sessionAttributes));

            //attributesManager.setPersistentAttributes(sessionAttributes.data);
            //attributesManager.savePersistentAttributes();
        }
    }
};

function buildIntent(name, slots={}) {
    return {
        name: name,
        confirmationStatus: "NONE",
        slots: slots
    };
}

function buildAssignment(slots) {
    return {
        course: slots.course.value,
        name: slots.assignment.value,
        dueDate: slots.date.value,
        dueTime: slots.time.value || undefined,
        priority: 1,
        completed: false
    };
}

function initializeUserData() {
    return {
        profile: {
            name: "",
            timezone: ""
        },
        preferences: {
            schedule: []
        },
        courses: {},
        assignments: []
    };
}

function getNewUserSetUpSpeech(isLaunchRequest) {
    let speechText = "";
    if (isLaunchRequest) {
        speechText += "<say-as interpret-as=\"interjection\">Hi there!</say-as> ";
        speechText += "Welcome to homework planner! ";

    } else {
        speechText += "<say-as interpret-as=\"interjection\">Hold on a sec!</say-as> ";
    }
    speechText += "In order to get set up, I need to ask you a few questions. ";
    return speechText;
}

function getWelcomeSpeech(sessionAttributes) {
    let speechText = "Welcome back, ";
    speechText += sessionAttributes.data.profile.name;
    speechText += " what would you like me to do?";

    let repromptText = "You can also ask me for help!";

    return [speechText, repromptText];
}

function getCurrentTime(timezone) {
    return Moment.utc().tz(timezone);
}

function confirmAssignmentSpeech(assignment) {
    let speechText = "Added " + assignment.course;
    speechText += " " + assignment.name;
    speechText += " on <say-as interpret-as=\"date\" format=\"md\">";
    speechText += assignment.dueDate.month + "/" + assignment.dueDate.day + "</say-as>";
    if (assignment.dueTime) {
        speechText += " at " + assignment.dueTime;
    }
    return speechText;
}

function initializeCourses(slots) {
    const slotNames = ["courseOne", "courseTwo", "courseThree", "courseFour", "courseFive"];
    let courses = {};
    for (let slot of slotNames) {
        if (slots[slot]) {
            courses[slots[slot].value] = {};
        }
    }
    return courses;
}

function getNextCoursePrompt(sessionAttributes) {
    let speechText = "Please tell me the meeting times for your ";
    speechText += sessionAttributes.nextCourse + " course. ";
    speechText +=
}

module.exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        InProgressSetUpIntentHandler,
        CompletedSetUpIntentHandler,
        RequireSetUpHandler,
        LaunchRequestHandler,
        AddCourseIntentHandler,
        AddHomeworkIntentHandler,
        HelpIntentHandler,
        ExitIntentHandler,
        SessionEndedRequestHandler)
    .addRequestInterceptors(
        NewSessionRequestInterceptor,
        SetTimezoneInterceptor,
        ConvertDateInterceptor)
    .addResponseInterceptors(
        SessionEndingResponseInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withPersistenceAdapter(PersistenceAdapter)
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();
