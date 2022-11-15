jest.mock('../../../../src/lib/analytics');

/* eslint-disable no-new */

const BaseView = require('../../../../src/views/base-view');
const GooglePayView = require('../../../../src/views/payment-sheet-views/google-pay-view');
const btGooglePay = require('braintree-web/google-payment');
const analytics = require('../../../../src/lib/analytics');
const assets = require('@braintree/asset-loader');
const fake = require('../../../helpers/fake');
const fs = require('fs');

const mainHTML = fs.readFileSync(`${__dirname}/../../../../src/html/main.html`, 'utf8');

describe('GooglePayView', () => {
  let testContext;

  beforeEach(() => {
    testContext = {};
    const googlePayButton = document.createElement('button');

    testContext.model = fake.model();

    testContext.div = document.createElement('div');

    testContext.div.innerHTML = mainHTML;
    document.body.appendChild(testContext.div);

    testContext.model.merchantConfiguration.googlePay = {
      merchantId: 'merchant-id',
      transactionInfo: {
        currencyCode: 'USD',
        totalPriceStatus: 'FINAL',
        totalPrice: '100.00'
      }
    };
    testContext.googlePayViewOptions = {
      environment: 'sandbox',
      element: document.body.querySelector('.braintree-sheet.braintree-googlePay'),
      model: testContext.model,
      strings: {}
    };

    testContext.fakeGooglePayInstance = {
      createPaymentDataRequest: jest.fn().mockReturnValue({
        merchantId: 'merchant-id',
        transactionInfo: {
          currencyCode: 'USD',
          totalPriceStatus: 'FINAL',
          totalPrice: '100.00'
        },
        allowedPaymentMethods: ['CARD', 'TOKENIZED_CARD']
      }),
      parseResponse: jest.fn().mockResolvedValue({
        type: 'AndroidPayCard',
        nonce: 'google-pay-nonce'
      })
    };
    testContext.fakeLoadPaymentDataResponse = {
      cardInfo: {
        cardNetwork: 'VISA',
        cardDetails: '1111',
        cardDescription: 'Visa •••• 1111',
        cardClass: 'DEBIT'
      },
      paymentMethodToken: {
        tokenizationType: 'PAYMENT_GATEWAY',
        token: '{"androidPayCards":[{"type":"AndroidPayCard","nonce":"google-pay-nonce","description":"Android Pay","consumed":false,"details":{"cardType":"Visa","lastTwo":"11","lastFour":"1111"},"binData":{"prepaid":"No","healthcare":"Unknown","debit":"Unknown","durbinRegulated":"Unknown","commercial":"Unknown","payroll":"Unknown","issuingBank":"Unknown","countryOfIssuance":"","productId":"Unknown"}}]}'
      },
      email: 'foo@example.com'
    };
    jest.spyOn(btGooglePay, 'create').mockResolvedValue(testContext.fakeGooglePayInstance);

    testContext.FakePaymentClient = function FakePayment() {};
    testContext.FakePaymentClient.prototype.isReadyToPay = jest.fn().mockResolvedValue({ result: true });
    testContext.FakePaymentClient.prototype.loadPaymentData = jest.fn().mockResolvedValue(testContext.fakeLoadPaymentDataResponse);
    testContext.FakePaymentClient.prototype.prefetchPaymentData = jest.fn().mockResolvedValue();
    testContext.FakePaymentClient.prototype.createButton = jest.fn().mockReturnValue(googlePayButton);

    global.google = {
      payments: {
        api: {
          PaymentsClient: testContext.FakePaymentClient
        }
      }
    };
  });

  afterEach(() => {
    document.body.removeChild(testContext.div);
    delete global.google;
  });

  describe('Constructor', () => {
    it('inherits from BaseView', () => {
      expect(new GooglePayView()).toBeInstanceOf(BaseView);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      testContext.view = new GooglePayView(testContext.googlePayViewOptions);
    });

    test('notifies async dependency', () => {
      jest.spyOn(testContext.view.model, 'asyncDependencyReady').mockImplementation();

      return testContext.view.initialize().then(() => {
        expect(testContext.view.model.asyncDependencyReady).toBeCalledTimes(1);
        expect(testContext.view.model.asyncDependencyReady).toBeCalledWith('googlePay');
      });
    });

    it('creates a GooglePayment component', () => {
      return testContext.view.initialize().then(() => {
        expect(btGooglePay.create).toBeCalledWith(expect.objectContaining({
        }));
        expect(testContext.view.googlePayInstance).toBe(testContext.fakeGooglePayInstance);
      });
    });

    it('can configure GooglePayment component with googleApiVersion', () => {
      testContext.model.merchantConfiguration.googlePay.googlePayVersion = 2;

      return testContext.view.initialize().then(() => {
        expect(btGooglePay.create).toBeCalledWith(expect.objectContaining({
          googlePayVersion: 2
        }));
        expect(testContext.view.googlePayInstance).toBe(testContext.fakeGooglePayInstance);
      });
    });

    it('can configure GooglePayment component with googleMerchantId', () => {
      testContext.model.merchantConfiguration.googlePay.merchantId = 'foobar';

      return testContext.view.initialize().then(() => {
        expect(btGooglePay.create).toBeCalledWith(expect.objectContaining({
          googleMerchantId: 'foobar'
        }));
        expect(testContext.view.googlePayInstance).toBe(testContext.fakeGooglePayInstance);
      });
    });

    it('creates a Google payments client', () => {
      return testContext.view.initialize().then(() => {
        expect(testContext.view.paymentsClient).toBeInstanceOf(testContext.FakePaymentClient);
      });
    });

    it('configures payments client with PRODUCTION environment in production', () => {
      testContext.view.model.environment = 'production';
      jest.spyOn(global.google.payments.api, 'PaymentsClient');

      return testContext.view.initialize().then(() => {
        expect(global.google.payments.api.PaymentsClient).toBeCalledWith({
          environment: 'PRODUCTION'
        });
      });
    });

    it('configures payments client with TEST environment in non-production', () => {
      testContext.view.model.environment = 'sandbox';
      jest.spyOn(global.google.payments.api, 'PaymentsClient');

      return testContext.view.initialize().then(() => {
        expect(global.google.payments.api.PaymentsClient).toBeCalledWith({
          environment: 'TEST'
        });
      });
    });

    it('calls asyncDependencyFailed when Google Pay component creation fails', () => {
      const fakeError = new Error('A_FAKE_ERROR');

      jest.spyOn(testContext.view.model, 'asyncDependencyFailed').mockImplementation();
      btGooglePay.create.mockRejectedValue(fakeError);

      return testContext.view.initialize().then(() => {
        const error = testContext.view.model.asyncDependencyFailed.mock.calls[0][0].error;

        expect(testContext.view.model.asyncDependencyFailed).toBeCalledTimes(1);
        expect(testContext.view.model.asyncDependencyFailed).toBeCalledWith(expect.objectContaining({
          view: 'googlePay'
        }));

        expect(error.message).toBe(fakeError.message);
      });
    });

    it('sets up button to tokenize Google Pay', () => {
      jest.spyOn(testContext.view, 'tokenize').mockResolvedValue();

      return testContext.view.initialize().then(() => {
        const handler = testContext.FakePaymentClient.prototype.createButton.mock.calls[0][0].onClick;

        expect(testContext.FakePaymentClient.prototype.createButton).toBeCalledTimes(1);
        expect(testContext.FakePaymentClient.prototype.createButton).toBeCalledWith({
          buttonType: 'short',
          onClick: expect.any(Function)
        });

        handler({ preventDefault: jest.fn() });

        expect(testContext.view.tokenize).toBeCalledTimes(1);
      });
    });

    it('can initialize buttons with custom settings', () => {
      testContext.model.merchantConfiguration.googlePay.button = {
        buttonType: 'long',
        buttonColor: 'white'
      };

      return testContext.view.initialize().then(() => {
        expect(testContext.FakePaymentClient.prototype.createButton).toBeCalledTimes(1);
        expect(testContext.FakePaymentClient.prototype.createButton).toBeCalledWith({
          buttonType: 'long',
          buttonColor: 'white',
          onClick: expect.any(Function)
        });
      });
    });

    it('cannot override onClick function for button', () => {
      testContext.model.merchantConfiguration.googlePay.button = {
        onClick: function () {
          throw new Error('Should never call this error');
        }
      };
      jest.spyOn(testContext.view, 'tokenize').mockResolvedValue();

      return testContext.view.initialize().then(() => {
        const handler = testContext.FakePaymentClient.prototype.createButton.mock.calls[0][0].onClick;

        expect(testContext.FakePaymentClient.prototype.createButton).toBeCalledTimes(1);
        expect(testContext.FakePaymentClient.prototype.createButton).toBeCalledWith({
          buttonType: 'short',
          onClick: expect.any(Function)
        });

        expect(() => {
          handler({ preventDefault: jest.fn() });
          expect(testContext.view.tokenize).toBeCalledTimes(1);
        }).not.toThrowError();
      });
    });
  });

  describe('tokenize', () => {
    beforeEach(() => {
      testContext.view = new GooglePayView(testContext.googlePayViewOptions);
      jest.spyOn(testContext.view.model, 'addPaymentMethod').mockImplementation();
      jest.spyOn(testContext.view.model, 'reportError').mockImplementation();

      return testContext.view.initialize();
    });

    it('creates a paymentDataRequest from googlePayConfiguration', () => {
      return testContext.view.tokenize().then(() => {
        expect(testContext.fakeGooglePayInstance.createPaymentDataRequest).toBeCalledTimes(1);
        expect(testContext.fakeGooglePayInstance.createPaymentDataRequest).toBeCalledWith({
          transactionInfo: {
            currencyCode: 'USD',
            totalPriceStatus: 'FINAL',
            totalPrice: '100.00'
          }
        });
      });
    });

    test('does not pass along button configuration to createPaymentDataRequest', async () => {
      testContext.model.merchantConfiguration.googlePay.button = {
        buttonType: 'long',
        buttonColor: 'white'
      };
      const view = new GooglePayView(testContext.googlePayViewOptions);

      jest.spyOn(view.model, 'addPaymentMethod').mockImplementation();
      jest.spyOn(view.model, 'reportError').mockImplementation();

      await view.initialize();

      await view.tokenize();

      expect(testContext.fakeGooglePayInstance.createPaymentDataRequest).toBeCalledTimes(1);
      expect(testContext.fakeGooglePayInstance.createPaymentDataRequest).toBeCalledWith({
        transactionInfo: {
          currencyCode: 'USD',
          totalPriceStatus: 'FINAL',
          totalPrice: '100.00'
        }
      });
    });

    test('calls loadPaymentData with paymentDataRequest', () => {
      return testContext.view.tokenize().then(() => {
        expect(testContext.FakePaymentClient.prototype.loadPaymentData).toBeCalledTimes(1);
        expect(testContext.FakePaymentClient.prototype.loadPaymentData).toBeCalledWith({
          merchantId: 'merchant-id',
          transactionInfo: {
            currencyCode: 'USD',
            totalPriceStatus: 'FINAL',
            totalPrice: '100.00'
          },
          allowedPaymentMethods: ['CARD', 'TOKENIZED_CARD']
        });
      });
    });

    it('parses the response from loadPaymentData', () => {
      return testContext.view.tokenize().then(() => {
        expect(testContext.fakeGooglePayInstance.parseResponse).toBeCalledTimes(1);
        expect(testContext.fakeGooglePayInstance.parseResponse).toBeCalledWith(testContext.fakeLoadPaymentDataResponse);
      });
    });

    it('adds PaymentMethod to model', () => {
      return testContext.view.tokenize().then(() => {
        expect(testContext.view.model.addPaymentMethod).toBeCalledTimes(1);
        expect(testContext.view.model.addPaymentMethod).toBeCalledWith({
          type: 'AndroidPayCard',
          nonce: 'google-pay-nonce',
          rawPaymentData: testContext.fakeLoadPaymentDataResponse
        });
      });
    });

    it('reports error as developerError if error statusCode is DEVELOPER_ERROR', () => {
      const error = new Error('loadPaymentData error');

      jest.spyOn(console, 'error').mockImplementation();
      error.statusCode = 'DEVELOPER_ERROR';
      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(testContext.view.model.reportError).toBeCalledTimes(1);
        expect(testContext.view.model.reportError).toBeCalledWith('developerError');
      });
    });

    it('prints detailed error on console if error statusCode is DEVELOPER_ERROR', () => {
      const error = new Error('loadPaymentData error');

      jest.spyOn(console, 'error').mockImplementation();
      error.statusCode = 'DEVELOPER_ERROR';
      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(console.error).toBeCalledTimes(1);
        expect(console.error).toBeCalledWith(error);
      });
    });

    it('sends analytics when loadPaymentData call fails', () => {
      const error = new Error('loadPaymentData error');

      error.statusCode = 'CODE';
      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(analytics.sendEvent).toBeCalledTimes(1);
        expect(analytics.sendEvent).toBeCalledWith('googlepay.loadPaymentData.failed');
      });
    });

    it('does not report erorr if statusCode is CANCELLED', () => {
      const error = new Error('loadPaymentData error');

      error.statusCode = 'CANCELED';
      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(testContext.view.model.reportError).not.toBeCalled();
      });
    });

    it('sends cancelled event for Google Pay cancelation', () => {
      const error = new Error('loadPaymentData error');

      error.statusCode = 'CANCELED';
      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(analytics.sendEvent).toBeCalledTimes(1);
        expect(analytics.sendEvent).toBeCalledWith('googlepay.loadPaymentData.canceled');
      });
    });

    it('does not send analytics event for developer error', () => {
      const error = new Error('loadPaymentData error');

      jest.spyOn(console, 'error').mockImplementation();
      error.statusCode = 'DEVELOPER_ERROR';
      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(analytics.sendEvent).not.toBeCalled();
      });
    });

    it('does not send analytics event for errors without a statusCode', () => {
      const error = new Error('error');

      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(analytics.sendEvent).not.toBeCalled();
      });
    });

    it('reports error if loadPaymentData rejects', () => {
      const error = new Error('loadPaymentData error');

      testContext.FakePaymentClient.prototype.loadPaymentData.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(testContext.view.model.reportError).toBeCalledTimes(1);
        expect(testContext.view.model.reportError).toBeCalledWith(error);
      });
    });

    it('reports error if parseResponse rejects', () => {
      const error = new Error('parseResponse error');

      testContext.fakeGooglePayInstance.parseResponse.mockRejectedValue(error);

      return testContext.view.tokenize().then(() => {
        expect(testContext.view.model.reportError).toBeCalledTimes(1);
        expect(testContext.view.model.reportError).toBeCalledWith(error);
      });
    });
  });

  describe('updateConfiguration', () => {
    beforeEach(() => {
      testContext.view = new GooglePayView(testContext.googlePayViewOptions);

      return testContext.view.initialize();
    });

    it('updates values in googlePayConfiguration', () => {
      const newTransactionInfo = {
        currencyCode: 'EU',
        totalPriceStatus: 'FINAL',
        totalPrice: '200.00'
      };

      expect(testContext.view.googlePayConfiguration.transactionInfo).toEqual({
        currencyCode: 'USD',
        totalPriceStatus: 'FINAL',
        totalPrice: '100.00'
      });

      testContext.view.updateConfiguration('transactionInfo', newTransactionInfo);

      expect(testContext.view.googlePayConfiguration.transactionInfo).toEqual(newTransactionInfo);
    });
  });

  describe('isEnabled', () => {
    beforeEach(() => {
      jest.spyOn(assets, 'loadScript').mockResolvedValue();
      testContext.fakeOptions = {
        environment: 'sandbox',
        merchantConfiguration: testContext.model.merchantConfiguration
      };
    });

    it('resolves with false when merhcantConfiguration does not specify Google Pay', () => {
      delete testContext.fakeOptions.merchantConfiguration.googlePay;

      return GooglePayView.isEnabled(testContext.fakeOptions).then(result => {
        expect(result).toBe(false);
      });
    });

    it('loads Google Payment script file when google global does not exist', () => {
      const storedFakeGoogle = global.google;

      delete global.google;

      assets.loadScript.mockImplementation(() => {
        global.google = storedFakeGoogle;

        return Promise.resolve();
      });

      return GooglePayView.isEnabled(testContext.fakeOptions).then(() => {
        expect(assets.loadScript).toBeCalledTimes(1);
        expect(assets.loadScript).toBeCalledWith({
          id: 'braintree-dropin-google-payment-script',
          src: 'https://pay.google.com/gp/p/js/pay.js'
        });
      });
    });

    it('loads Google Payment script file when the payment client on google global does not exist', () => {
      const storedFakeGoogle = global.google;

      delete global.google;
      global.google = {
        payments: {
          api: {}
        }
      };

      assets.loadScript.mockImplementation(() => {
        global.google = storedFakeGoogle;

        return Promise.resolve();
      });

      return GooglePayView.isEnabled(testContext.fakeOptions).then(() => {
        expect(assets.loadScript).toBeCalledTimes(1);
        expect(assets.loadScript).toBeCalledWith({
          id: 'braintree-dropin-google-payment-script',
          src: 'https://pay.google.com/gp/p/js/pay.js'
        });
      });
    });

    it('does not load Google Payment script file if global google pay object already exists', () => {
      return GooglePayView.isEnabled(testContext.fakeOptions).then(() => {
        expect(assets.loadScript).not.toBeCalled();
      });
    });

    it('calls isReadyToPay to check device compatibility', () => {
      return GooglePayView.isEnabled(testContext.fakeOptions).then(() => {
        expect(testContext.FakePaymentClient.prototype.isReadyToPay).toBeCalledTimes(1);
        expect(testContext.FakePaymentClient.prototype.isReadyToPay).toBeCalledWith({
          allowedPaymentMethods: ['CARD', 'TOKENIZED_CARD']
        });
      });
    });

    it('resolves with false when isReadyToPay is not successful', () => {
      testContext.FakePaymentClient.prototype.isReadyToPay.mockResolvedValue({ result: false });

      return GooglePayView.isEnabled(testContext.fakeOptions).then(result => {
        expect(result).toBe(false);
      });
    });

    it('resolves with true when isReadyToPay is successful', () => {
      testContext.FakePaymentClient.prototype.isReadyToPay.mockResolvedValue({ result: true });

      return GooglePayView.isEnabled(testContext.fakeOptions).then(result => {
        expect(result).toBe(true);
      });
    });

    it('creates a payment client in test mode when using sandbox environment', () => {
      jest.spyOn(global.google.payments.api, 'PaymentsClient').mockReturnValue({
        isReadyToPay: jest.fn().mockResolvedValue({
          result: true
        })
      });
      testContext.fakeOptions.environment = 'sandbox';

      return GooglePayView.isEnabled(testContext.fakeOptions).then(() => {
        expect(global.google.payments.api.PaymentsClient).toBeCalledWith({
          environment: 'TEST'
        });
      });
    });

    it('creates a payment client in production mode when using production environment',
      () => {
        jest.spyOn(global.google.payments.api, 'PaymentsClient').mockReturnValue({
          isReadyToPay: jest.fn().mockResolvedValue({
            result: true
          })
        });
        testContext.fakeOptions.environment = 'production';

        return GooglePayView.isEnabled(testContext.fakeOptions).then(() => {
          expect(global.google.payments.api.PaymentsClient).toBeCalledWith({
            environment: 'PRODUCTION'
          });
        });
      });
  });
});
