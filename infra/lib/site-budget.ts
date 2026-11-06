import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';

const MONTHLY_LIMIT_USD = 2;

function alertAbove100Percent(notificationType: 'ACTUAL' | 'FORECASTED', email: string) {
  return {
    notification: { notificationType, comparisonOperator: 'GREATER_THAN', threshold: 100 },
    subscribers: [{ subscriptionType: 'EMAIL', address: email }],
  };
}

/**
 * A monthly cost budget for the resources tagged `project=princetronics` in this stack's account, emailing `email`
 * when actual or forecast spend passes the limit. The tag must be activated as a cost allocation tag to count.
 */
export class SiteBudget extends Construct {
  constructor(scope: Construct, id: string, props: { email: string }) {
    super(scope, id);
    new CfnBudget(this, 'Budget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: MONTHLY_LIMIT_USD, unit: 'USD' },
        metrics: ['UnblendedCost'],
        filterExpression: { tags: { key: 'user:project', values: ['princetronics'] } },
      },
      notificationsWithSubscribers: [
        alertAbove100Percent('ACTUAL', props.email),
        alertAbove100Percent('FORECASTED', props.email),
      ],
    });
  }
}
