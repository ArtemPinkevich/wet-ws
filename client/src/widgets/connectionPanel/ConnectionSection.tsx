import classNames from 'classnames';

import { ChangeEvent, useState } from 'react';

import { Box, TextField, Typography } from '@mui/material';

import { StyledButton } from '../../shared/ui';
import { useStyles } from './style';

interface IConnectionPanel {
  title: string;
  // TODO: убрать ?
  submitMethod?: () => void;
}

const ConnectionSection = (props: IConnectionPanel) => {
  const { title, submitMethod } = props;
  const { classes } = useStyles();
  const [ip, setIp] = useState<string | null>(null);
  const [port, setPort] = useState<string | null>(null);
  const [isConnect, setConnect] = useState<boolean>(false);

  const handleChangeIp = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value != null && event.target.value != '')
      setIp(event.target.value);
  };

  const handleChangePort = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value != null && event.target.value != '')
      setPort(event.target.value);
  };

  const submitData = async () => {
    // TODO: убрать !
    await submitMethod!();
  };

  return (
    <Box>
      <Typography variant="h6">{title}</Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <TextField
          value={ip}
          onChange={handleChangeIp}
          variant="outlined"
          size="small"
          className={classes.textField}
        />
        <TextField
          value={port}
          onChange={handleChangePort}
          variant="outlined"
          size="small"
          className={classNames(classes.textField, classes.textField_port)}
        />
        <StyledButton onClick={submitData} sx={{ width: '10rem' }}>
          {!isConnect ? 'disconnect' : 'connect'}
        </StyledButton>
      </Box>
    </Box>
  );
};

export default ConnectionSection;
